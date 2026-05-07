const express = require('express');
const supabase = require('../database/supabase');
const { getDueProblems } = require('../services/spacedRepetition');
const { authenticate } = require('./middleware');
const { buildMcOptionsAsync } = require('../utils/aiMcOptions');

const router = express.Router();

async function enrichProblem(p) {
  let mcData = null;

  const rawMc = p.mc_options;
  if (rawMc) {
    try {
      const parsed = typeof rawMc === 'string' ? JSON.parse(rawMc) : rawMc;
      if (parsed && Array.isArray(parsed.options) && parsed.options.length === 4 &&
          typeof parsed.correctIndex === 'number') {
        mcData = parsed;
      }
    } catch {}
  }

  if (!mcData) {
    mcData = await buildMcOptionsAsync(p);
    try {
      await supabase.from('problems')
        .update({ mc_options: JSON.stringify(mcData) })
        .eq('id', p.id);
    } catch {}
  }

  return {
    ...p,
    hints: (() => { try { return typeof p.hints === 'string' ? JSON.parse(p.hints || '[]') : (p.hints || []) } catch { return [] } })(),
    tags: (() => { try { return typeof p.tags === 'string' ? JSON.parse(p.tags || '[]') : (p.tags || []) } catch { return [] } })(),
    solution_steps: (() => { try { return typeof p.solution_steps === 'string' ? JSON.parse(p.solution_steps || '[]') : (p.solution_steps || []) } catch { return [] } })(),
    mc_options: mcData.options,
    correct_option_index: mcData.correctIndex
  };
}

// Get count of due problems
router.get('/due/count', authenticate, async (req, res) => {
  try {
    const { grade } = req.query;
    const now = new Date().toISOString();

    const { count: dueCount } = await supabase
      .from('student_problem_records')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', req.studentId)
      .lte('next_review', now);

    // Get already-seen problem IDs
    const { data: seenRecords } = await supabase
      .from('student_problem_records')
      .select('problem_id')
      .eq('student_id', req.studentId);
    const seenIds = (seenRecords || []).map(r => r.problem_id);

    let newQuery = supabase.from('problems').select('*', { count: 'exact', head: true });
    if (seenIds.length > 0) newQuery = newQuery.not('id', 'in', `(${seenIds.join(',')})`);
    if (grade) newQuery = newQuery.eq('grade', grade);
    const { count: rawNewCount } = await newQuery;
    const newCount = Math.min(rawNewCount || 0, 10);

    res.json({
      due: dueCount || 0,
      new: newCount,
      total: (dueCount || 0) + Math.min(newCount, 5)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get distinct topics grouped by grade
router.get('/topics', authenticate, async (req, res) => {
  try {
    const { grade, curriculum } = req.query;
    let query = supabase.from('problems').select('topic, grade, curriculum');
    if (grade) query = query.eq('grade', grade);
    if (curriculum) query = query.eq('curriculum', curriculum);
    query = query.order('grade').order('curriculum').order('topic');

    const { data: rows } = await query;

    // Aggregate counts in JS
    const topicMap = {};
    for (const r of rows || []) {
      const key = `${r.grade}::${r.curriculum}::${r.topic}`;
      if (!topicMap[key]) topicMap[key] = { topic: r.topic, grade: r.grade, curriculum: r.curriculum, total_count: 0 };
      topicMap[key].total_count++;
    }
    const topics = Object.values(topicMap);
    const grouped = {};
    for (const t of topics) {
      if (!grouped[t.curriculum]) grouped[t.curriculum] = [];
      grouped[t.curriculum].push(t);
    }

    res.json({ topics, grouped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get distinct curriculum categories for a grade
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { grade } = req.query;
    let query = supabase.from('problems').select('curriculum');
    if (grade) query = query.eq('grade', grade);
    const { data } = await query.order('curriculum');

    const categories = [...new Set((data || []).map(r => r.curriculum))];
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get per-topic accuracy stats for the logged-in student
router.get('/topic-stats', authenticate, async (req, res) => {
  try {
    const { data: attempts } = await supabase
      .from('session_attempts')
      .select('quality, attempted_at, problems!inner(topic, grade)')
      .eq('student_id', req.studentId);

    const topicMap = {};
    for (const a of attempts || []) {
      const p = a.problems;
      if (!p) continue;
      const key = `${p.grade}::${p.topic}`;
      if (!topicMap[key]) topicMap[key] = { topic: p.topic, grade: p.grade, total: 0, correct: 0, last_studied: null };
      topicMap[key].total++;
      if (a.quality >= 3) topicMap[key].correct++;
      if (!topicMap[key].last_studied || a.attempted_at > topicMap[key].last_studied) {
        topicMap[key].last_studied = a.attempted_at;
      }
    }

    const stats = Object.values(topicMap).map(t => ({
      topic: t.topic,
      grade: t.grade,
      total_attempts: t.total,
      accuracy: t.total > 0 ? Math.round(100 * t.correct / t.total) : 0,
      last_studied: t.last_studied
    }));

    res.json({ stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get due problems for study session
router.get('/due', authenticate, async (req, res) => {
  try {
    const { grade, topic, curriculum, difficulty, limit = 15 } = req.query;
    const raw = await getDueProblems(
      req.studentId,
      grade || null,
      parseInt(limit),
      topic || null,
      curriculum || null,
      difficulty || null
    );
    const problems = await Promise.all(raw.map(enrichProblem));
    res.json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

// Get all problems
router.get('/', authenticate, async (req, res) => {
  try {
    const { grade, curriculum } = req.query;
    let query = supabase.from('problems').select('*').order('grade').order('difficulty');
    if (grade) query = query.eq('grade', grade);
    if (curriculum) query = query.eq('curriculum', curriculum);

    const { data: raw } = await query;
    const problems = await Promise.all((raw || []).map(enrichProblem));
    res.json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

// Get a single problem
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: p } = await supabase
      .from('problems')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (!p) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
    res.json(await enrichProblem(p));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

// Regenerate MC options for ALL problems
router.post('/regen-mc', authenticate, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const { data: problems } = await supabase.from('problems').select('*').order('id');
  let done = 0, failed = 0;

  const BATCH = 5;
  for (let i = 0; i < (problems || []).length; i += BATCH) {
    const batch = (problems || []).slice(i, i + BATCH);
    await Promise.all(batch.map(async (p) => {
      try {
        const mcData = await buildMcOptionsAsync(p);
        await supabase.from('problems').update({ mc_options: JSON.stringify(mcData) }).eq('id', p.id);
        done++;
      } catch (err) {
        console.error(`[regen-mc] Problem ${p.id} failed:`, err.message);
        failed++;
      }
    }));
  }

  res.json({ done, failed, total: (problems || []).length });
});

module.exports = router;
module.exports.enrichProblem = enrichProblem;

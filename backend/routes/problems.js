const express = require('express');
const db = require('../database/db');
const { getDueProblems } = require('../services/spacedRepetition');
const { authenticate } = require('./middleware');
const { buildMcOptionsAsync } = require('../utils/aiMcOptions');

const router = express.Router();

/**
 * Enrich a raw DB problem row with parsed JSON fields and MC options.
 * Reads mc_options from cache if present; otherwise generates via AI and caches.
 */
async function enrichProblem(p) {
  let mcData = null

  if (p.mc_options) {
    try {
      const parsed = JSON.parse(p.mc_options)
      // Validate cache: must have options array and correctIndex
      if (parsed && Array.isArray(parsed.options) && parsed.options.length === 4 &&
          typeof parsed.correctIndex === 'number') {
        mcData = parsed
      }
    } catch {}
  }

  if (!mcData) {
    // Generate AI options and cache them
    mcData = await buildMcOptionsAsync(p)
    try {
      db.prepare('UPDATE problems SET mc_options = ? WHERE id = ?')
        .run(JSON.stringify(mcData), p.id)
    } catch {}
  }

  return {
    ...p,
    hints: (() => { try { return JSON.parse(p.hints || '[]') } catch { return [] } })(),
    tags: (() => { try { return JSON.parse(p.tags || '[]') } catch { return [] } })(),
    solution_steps: (() => { try { return JSON.parse(p.solution_steps || '[]') } catch { return [] } })(),
    mc_options: mcData.options,
    correct_option_index: mcData.correctIndex
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Get count of due problems
router.get('/due/count', authenticate, (req, res) => {
  const { grade } = req.query;
  const now = new Date().toISOString();

  const dueCount = db.prepare(`
    SELECT COUNT(*) as count FROM student_problem_records
    WHERE student_id = ? AND next_review <= ?
  `).get(req.studentId, now);

  const newCount = db.prepare(`
    SELECT COUNT(*) as count FROM problems p
    WHERE p.id NOT IN (
      SELECT problem_id FROM student_problem_records WHERE student_id = ?
    ) ${grade ? 'AND p.grade = ?' : ''}
    LIMIT 10
  `).get(req.studentId, ...(grade ? [grade] : []));

  res.json({
    due: dueCount.count,
    new: newCount.count,
    total: dueCount.count + Math.min(newCount.count, 5)
  });
});

// Get distinct topics grouped by grade (optionally filtered by curriculum)
router.get('/topics', authenticate, (req, res) => {
  const { grade, curriculum } = req.query;
  const params = [];
  const conditions = [];
  if (grade) { conditions.push('p.grade = ?'); params.push(grade); }
  if (curriculum) { conditions.push('p.curriculum = ?'); params.push(curriculum); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const topics = db.prepare(`
    SELECT p.topic, p.grade, p.curriculum,
      COUNT(*) as total_count,
      MIN(p.difficulty) as min_diff, MAX(p.difficulty) as max_diff
    FROM problems p
    ${where}
    GROUP BY p.topic, p.grade, p.curriculum
    ORDER BY p.grade, p.curriculum, p.topic
  `).all(...params);

  // Build grouped map: { curriculumName: [topic, ...] }
  const grouped = {};
  for (const t of topics) {
    if (!grouped[t.curriculum]) grouped[t.curriculum] = [];
    grouped[t.curriculum].push(t);
  }

  res.json({ topics, grouped });
});

// Get distinct curriculum categories for a grade
router.get('/categories', authenticate, (req, res) => {
  const { grade } = req.query;
  const params = [];
  let where = '';
  if (grade) { where = 'WHERE grade = ?'; params.push(grade); }

  const rows = db.prepare(`
    SELECT DISTINCT curriculum
    FROM problems
    ${where}
    ORDER BY curriculum
  `).all(...params);

  res.json({ categories: rows.map(r => r.curriculum) });
});

// Get per-topic accuracy stats for the logged-in student
router.get('/topic-stats', authenticate, (req, res) => {
  const stats = db.prepare(`
    SELECT p.topic, p.grade,
      COUNT(sa.id) as total_attempts,
      ROUND(100.0 * SUM(CASE WHEN sa.quality >= 3 THEN 1 ELSE 0 END) / COUNT(sa.id), 0) as accuracy,
      MAX(sa.attempted_at) as last_studied
    FROM session_attempts sa
    JOIN problems p ON sa.problem_id = p.id
    WHERE sa.student_id = ?
    GROUP BY p.topic, p.grade
  `).all(req.studentId);
  res.json({ stats });
});

// Get due problems for study session
// difficulty param: 'basic' (<=2) | 'medium' (=3) | 'advanced' (>=4)
router.get('/due', authenticate, async (req, res) => {
  try {
    const { grade, topic, curriculum, difficulty, limit = 15 } = req.query;
    const raw = getDueProblems(
      db,
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
    let query = 'SELECT * FROM problems';
    const params = [];
    if (grade || curriculum) {
      query += ' WHERE';
      if (grade) { query += ' grade = ?'; params.push(grade); }
      if (grade && curriculum) query += ' AND';
      if (curriculum) { query += ' curriculum = ?'; params.push(curriculum); }
    }
    query += ' ORDER BY grade, difficulty';
    const raw = db.prepare(query).all(...params);
    const problems = await Promise.all(raw.map(enrichProblem));
    res.json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

// Get a single problem
router.get('/:id', authenticate, async (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
    res.json(await enrichProblem(p));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

/**
 * Regenerate MC options for ALL problems using AI.
 * Clears cached options first, then processes in batches of 5 (parallel).
 * POST /problems/regen-mc
 */
router.post('/regen-mc', authenticate, async (req, res) => {
  // Stream progress so the caller can see it's working
  res.setHeader('Content-Type', 'application/json')

  const problems = db.prepare('SELECT * FROM problems ORDER BY id').all()
  let done = 0, failed = 0

  // Process in batches of 5 to avoid rate limits
  const BATCH = 5
  for (let i = 0; i < problems.length; i += BATCH) {
    const batch = problems.slice(i, i + BATCH)
    await Promise.all(batch.map(async (p) => {
      try {
        const { buildMcOptionsAsync } = require('../utils/aiMcOptions')
        const mcData = await buildMcOptionsAsync(p)
        db.prepare('UPDATE problems SET mc_options = ? WHERE id = ?')
          .run(JSON.stringify(mcData), p.id)
        done++
      } catch (err) {
        console.error(`[regen-mc] Problem ${p.id} failed:`, err.message)
        failed++
      }
    }))
  }

  res.json({ done, failed, total: problems.length })
})

module.exports = router;
module.exports.enrichProblem = enrichProblem;

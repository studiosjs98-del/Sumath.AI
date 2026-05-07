const express = require('express');
const supabase = require('../database/supabase');
const { authenticate } = require('./middleware');
const { enrichProblem } = require('./problems');

const router = express.Router();

// GET /diagnostic/questions?grade=X
router.get('/questions', authenticate, async (req, res) => {
  try {
    const { grade } = req.query;

    let { data: pool } = await supabase
      .from('problems')
      .select('*')
      .eq('grade', grade || '중3')
      .order('difficulty', { ascending: true })
      .limit(60);

    if ((pool || []).length < 15) {
      const { data: extra } = await supabase
        .from('problems')
        .select('*')
        .neq('grade', grade || '중3')
        .order('difficulty', { ascending: true })
        .limit(30);
      pool = [...(pool || []), ...(extra || [])];
    }

    // Shuffle for randomness
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const problems = await Promise.all(pool.map(enrichProblem));
    res.json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '진단 문제를 불러오는 중 오류가 발생했습니다.' });
  }
});

// POST /diagnostic/result
router.post('/result', authenticate, async (req, res) => {
  try {
    const { grade, percentile } = req.body;

    await supabase.from('students').update({
      diagnostic_done: 1,
      diagnostic_grade: grade || null,
      diagnostic_percentile: percentile || null
    }).eq('id', req.studentId);

    const { data: student } = await supabase
      .from('students')
      .select('id, username, display_name, grade_level, xp, level, rank, streak_days, last_study_date, diagnostic_done, diagnostic_grade, diagnostic_percentile')
      .eq('id', req.studentId)
      .single();

    res.json({ student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

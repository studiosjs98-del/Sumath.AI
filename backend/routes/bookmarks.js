const express = require('express');
const supabase = require('../database/supabase');
const { authenticate } = require('./middleware');
const { enrichProblem } = require('./problems');

const router = express.Router();

// Get all bookmarked problems for student (with AI MC options)
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('problem_id, created_at, problems(*)')
      .eq('student_id', req.studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map(b => b.problems).filter(Boolean);
    const enriched = await Promise.all(rows.map(enrichProblem));

    res.json({ bookmarks: enriched.map(p => ({ ...p, problem_id: p.id })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '복습 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

// Toggle bookmark (add if not exists, remove if exists)
router.post('/:problemId', authenticate, async (req, res) => {
  try {
    const { problemId } = req.params;

    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('student_id', req.studentId)
      .eq('problem_id', problemId)
      .maybeSingle();

    if (existing) {
      await supabase.from('bookmarks').delete()
        .eq('student_id', req.studentId)
        .eq('problem_id', problemId);
      res.json({ bookmarked: false });
    } else {
      await supabase.from('bookmarks').insert({ student_id: req.studentId, problem_id: problemId });
      res.json({ bookmarked: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all bookmark IDs
router.get('/ids', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('problem_id')
      .eq('student_id', req.studentId);
    if (error) throw error;
    res.json({ ids: (data || []).map(r => r.problem_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

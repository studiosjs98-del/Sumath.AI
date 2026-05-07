const express = require('express');
const { getHint, analyzeSteps } = require('../services/aiTutor');
const supabase = require('../database/supabase');
const { authenticate } = require('./middleware');

const router = express.Router();

// Get a hint for a problem
router.post('/hint', authenticate, async (req, res) => {
  try {
    const { problemId, studentSteps, hintNumber, previousHints } = req.body;

    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', problemId)
      .single();
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

    const hint = await getHint({
      problemLatex: problem.question_latex,
      studentSteps: studentSteps || [],
      hintNumber: hintNumber || 1,
      previousHints: previousHints || [],
      grade: problem.grade,
      topic: problem.topic
    });

    res.json({ hint });
  } catch (err) {
    console.error('AI hint error:', err);
    res.status(500).json({ error: 'AI 튜터가 잠시 쉬고 있습니다. 다시 시도해주세요.' });
  }
});

// Analyze student steps
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { problemId, studentSteps } = req.body;

    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', problemId)
      .single();
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

    const steps = typeof problem.solution_steps === 'string'
      ? JSON.parse(problem.solution_steps)
      : problem.solution_steps;

    const analysis = await analyzeSteps({
      problemLatex: problem.question_latex,
      correctSolutionSteps: steps,
      studentSteps: studentSteps || [],
      topic: problem.topic,
      grade: problem.grade
    });

    res.json({ analysis });
  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
  }
});

// Get pre-written hints (no AI, instant)
router.get('/static/:problemId', authenticate, async (req, res) => {
  try {
    const { data: problem } = await supabase
      .from('problems')
      .select('hints')
      .eq('id', req.params.problemId)
      .single();
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

    const hints = typeof problem.hints === 'string'
      ? JSON.parse(problem.hints || '[]')
      : (problem.hints || []);
    res.json({ hints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

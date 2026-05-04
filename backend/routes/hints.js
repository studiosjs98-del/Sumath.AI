const express = require('express');
const { getHint, analyzeSteps } = require('../services/aiTutor');
const db = require('../database/db');
const { authenticate } = require('./middleware');

const router = express.Router();

// Get a hint for a problem
router.post('/hint', authenticate, async (req, res) => {
  try {
    const { problemId, studentSteps, hintNumber, previousHints } = req.body;

    const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(problemId);
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

    const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(problemId);
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

    const analysis = await analyzeSteps({
      problemLatex: problem.question_latex,
      correctSolutionSteps: JSON.parse(problem.solution_steps),
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
router.get('/static/:problemId', authenticate, (req, res) => {
  const problem = db.prepare('SELECT hints FROM problems WHERE id = ?').get(req.params.problemId);
  if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

  res.json({ hints: JSON.parse(problem.hints || '[]') });
});

module.exports = router;

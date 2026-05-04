const express = require('express');
const db = require('../database/db');
const { getWeakTopics, getPerformanceBreakdown, getRecentSessions } = require('../services/analytics');
const { generateSessionFeedback } = require('../services/aiTutor');
const { authenticate } = require('./middleware');

const router = express.Router();

// Get student overview
router.get('/overview', authenticate, (req, res) => {
  const student = db.prepare(
    'SELECT id, username, display_name, grade_level, xp, level, rank, streak_days, last_study_date FROM students WHERE id = ?'
  ).get(req.studentId);

  const totalAttempts = db.prepare(
    'SELECT COUNT(*) as count FROM session_attempts WHERE student_id = ?'
  ).get(req.studentId);

  const correctAttempts = db.prepare(
    'SELECT COUNT(*) as count FROM session_attempts WHERE student_id = ? AND quality >= 3'
  ).get(req.studentId);

  const dueCount = db.prepare(`
    SELECT COUNT(*) as count FROM student_problem_records
    WHERE student_id = ? AND next_review <= datetime('now')
  `).get(req.studentId);

  const todayAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM session_attempts
    WHERE student_id = ? AND DATE(attempted_at) = DATE('now')
  `).get(req.studentId);

  res.json({
    student,
    stats: {
      totalAttempts: totalAttempts.count,
      correctAttempts: correctAttempts.count,
      accuracy: totalAttempts.count > 0
        ? Math.round(100 * correctAttempts.count / totalAttempts.count)
        : 0,
      dueForReview: dueCount.count,
      todayAttempts: todayAttempts.count
    }
  });
});

// Get all wrong answers (오답 노트) — distinct problems, most recently wrong first
router.get('/wrong-answers', authenticate, (req, res) => {
  const problems = db.prepare(`
    SELECT p.id, p.grade, p.topic, p.unit, p.curriculum, p.difficulty,
           p.question_latex, p.answer_latex, p.solution_steps, p.hints,
           COUNT(sa.id) as wrong_count,
           MAX(sa.attempted_at) as last_wrong_at
    FROM session_attempts sa
    JOIN problems p ON sa.problem_id = p.id
    WHERE sa.student_id = ? AND sa.quality < 3
    GROUP BY p.id
    ORDER BY last_wrong_at DESC
    LIMIT 100
  `).all(req.studentId);

  res.json({
    problems: problems.map(p => ({
      ...p,
      hints: (() => { try { return JSON.parse(p.hints || '[]') } catch { return [] } })(),
      solution_steps: (() => { try { return JSON.parse(p.solution_steps || '[]') } catch { return [] } })()
    }))
  });
});

// Get recent wrong answers
router.get('/recent-wrong', authenticate, (req, res) => {
  const wrong = db.prepare(`
    SELECT sa.id, sa.problem_id, sa.quality, sa.attempted_at,
           p.question_latex, p.topic, p.grade, p.difficulty, p.curriculum
    FROM session_attempts sa
    JOIN problems p ON sa.problem_id = p.id
    WHERE sa.student_id = ? AND sa.quality < 3
    ORDER BY sa.attempted_at DESC
    LIMIT 3
  `).all(req.studentId);
  res.json({ wrong });
});

// Get weak topics
router.get('/weak-topics', authenticate, (req, res) => {
  const weakTopics = getWeakTopics(req.studentId);
  res.json({ weakTopics });
});

// Get performance breakdown
router.get('/breakdown', authenticate, (req, res) => {
  const breakdown = getPerformanceBreakdown(req.studentId);
  res.json({ breakdown });
});

// Get session history
router.get('/sessions', authenticate, (req, res) => {
  const sessions = getRecentSessions(req.studentId);
  res.json({ sessions });
});

// Get today's review queue
router.get('/review-queue', authenticate, (req, res) => {
  const queue = db.prepare(`
    SELECT p.id, p.grade, p.topic, p.difficulty, p.question_latex,
           spr.next_review, spr.ease_factor, spr.total_attempts, spr.correct_attempts
    FROM student_problem_records spr
    JOIN problems p ON spr.problem_id = p.id
    WHERE spr.student_id = ? AND spr.next_review <= datetime('now', '+1 day')
    ORDER BY spr.next_review ASC
    LIMIT 20
  `).all(req.studentId);

  res.json({ queue });
});

// Generate AI feedback for a session
router.post('/feedback', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND student_id = ?')
      .get(sessionId, req.studentId);
    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });

    const student = db.prepare('SELECT grade_level FROM students WHERE id = ?').get(req.studentId);
    const weakTopics = getWeakTopics(req.studentId, 3);

    const feedback = await generateSessionFeedback({
      attempts: { total: session.problems_attempted, correct: session.problems_correct },
      weakTopics,
      grade: student.grade_level
    });

    res.json({ feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI 피드백 생성 중 오류가 발생했습니다.' });
  }
});

module.exports = router;

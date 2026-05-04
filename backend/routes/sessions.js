const express = require('express');
const db = require('../database/db');
const { recordAttempt, QUALITY_MAP } = require('../services/spacedRepetition');
const { calculateXP, updateStudentRank, updateStreak, recordMistake } = require('../services/analytics');
const { authenticate } = require('./middleware');

const router = express.Router();

// Start a new session
router.post('/start', authenticate, (req, res) => {
  const result = db.prepare(
    'INSERT INTO sessions (student_id) VALUES (?)'
  ).run(req.studentId);

  updateStreak(req.studentId);

  res.json({ sessionId: result.lastInsertRowid });
});

// Submit an attempt
router.post('/:sessionId/attempt', authenticate, (req, res) => {
  const { problemId, quality: qualityLabel, timeSpent, hintsUsed, studentSteps } = req.body;
  const { sessionId } = req.params;

  if (!QUALITY_MAP.hasOwnProperty(qualityLabel)) {
    return res.status(400).json({ error: '올바른 평가를 선택해주세요: 틀림, 헷갈림, 맞음' });
  }

  const quality = QUALITY_MAP[qualityLabel];

  // Get problem details for mistake tracking
  const problem = db.prepare('SELECT topic, curriculum, grade FROM problems WHERE id = ?').get(problemId);

  // Record mistake if wrong
  if (quality < 3 && problem) {
    recordMistake(req.studentId, problem.topic, problem.curriculum, problem.grade);
  }

  // Update spaced repetition
  const srUpdate = recordAttempt(db, req.studentId, problemId, qualityLabel, hintsUsed);

  // Calculate XP
  const difficulty = db.prepare('SELECT difficulty FROM problems WHERE id = ?').get(problemId)?.difficulty || 1;
  const xpEarned = calculateXP(quality, difficulty, hintsUsed || 0);

  // Record session attempt
  db.prepare(`
    INSERT INTO session_attempts
      (session_id, problem_id, student_id, quality, time_spent_seconds, hints_used, student_steps)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, problemId, req.studentId, quality, timeSpent || 0, hintsUsed || 0, JSON.stringify(studentSteps || []));

  // Update session stats
  db.prepare(`
    UPDATE sessions SET
      problems_attempted = problems_attempted + 1,
      problems_correct = problems_correct + ?,
      xp_earned = xp_earned + ?
    WHERE id = ?
  `).run(quality >= 3 ? 1 : 0, xpEarned, sessionId);

  // Update student XP
  if (xpEarned > 0) {
    db.prepare('UPDATE students SET xp = xp + ? WHERE id = ?').run(xpEarned, req.studentId);
    updateStudentRank(req.studentId);
  }

  // Get updated student stats
  const updatedStudent = db.prepare(
    'SELECT xp, level, rank, streak_days FROM students WHERE id = ?'
  ).get(req.studentId);

  res.json({
    xpEarned,
    nextReview: srUpdate.next_review,
    intervalDays: srUpdate.interval_days,
    student: updatedStudent
  });
});

// End a session and get summary
router.post('/:sessionId/end', authenticate, async (req, res) => {
  const { sessionId } = req.params;

  db.prepare(
    "UPDATE sessions SET ended_at = datetime('now') WHERE id = ? AND student_id = ?"
  ).run(sessionId, req.studentId);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

  // Get weak topics
  const weakTopics = db.prepare(`
    SELECT mp.topic, mp.error_count
    FROM mistake_patterns mp
    WHERE mp.student_id = ?
    ORDER BY mp.error_count DESC LIMIT 3
  `).all(req.studentId);

  res.json({
    session,
    weakTopics
  });
});

module.exports = router;

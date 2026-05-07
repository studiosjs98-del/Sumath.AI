const express = require('express');
const supabase = require('../database/supabase');
const { recordAttempt, QUALITY_MAP } = require('../services/spacedRepetition');
const { calculateXP, updateStudentRank, updateStreak, recordMistake } = require('../services/analytics');
const { authenticate } = require('./middleware');

const router = express.Router();

// Start a new session
router.post('/start', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ student_id: req.studentId })
      .select('id')
      .single();
    if (error) throw error;

    await updateStreak(req.studentId);

    res.json({ sessionId: data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Submit an attempt
router.post('/:sessionId/attempt', authenticate, async (req, res) => {
  try {
    const { problemId, quality: qualityLabel, timeSpent, hintsUsed, studentSteps } = req.body;
    const { sessionId } = req.params;

    if (!Object.prototype.hasOwnProperty.call(QUALITY_MAP, qualityLabel)) {
      return res.status(400).json({ error: '올바른 평가를 선택해주세요: 틀림, 헷갈림, 맞음' });
    }

    const quality = QUALITY_MAP[qualityLabel];

    // Get problem details
    const { data: problem } = await supabase
      .from('problems')
      .select('topic, curriculum, grade, difficulty')
      .eq('id', problemId)
      .single();

    // Record mistake if wrong
    if (quality < 3 && problem) {
      await recordMistake(req.studentId, problem.topic, problem.curriculum, problem.grade);
    }

    // Update spaced repetition
    const srUpdate = await recordAttempt(req.studentId, problemId, qualityLabel, hintsUsed);

    // Calculate XP
    const difficulty = problem?.difficulty || 1;
    const xpEarned = calculateXP(quality, difficulty, hintsUsed || 0);

    // Record session attempt
    await supabase.from('session_attempts').insert({
      session_id: sessionId,
      problem_id: problemId,
      student_id: req.studentId,
      quality,
      time_spent_seconds: timeSpent || 0,
      hints_used: hintsUsed || 0,
      student_steps: JSON.stringify(studentSteps || [])
    });

    // Update session stats (fetch then increment)
    const { data: session } = await supabase
      .from('sessions')
      .select('problems_attempted, problems_correct, xp_earned')
      .eq('id', sessionId)
      .single();

    if (session) {
      await supabase.from('sessions').update({
        problems_attempted: session.problems_attempted + 1,
        problems_correct: session.problems_correct + (quality >= 3 ? 1 : 0),
        xp_earned: session.xp_earned + xpEarned
      }).eq('id', sessionId);
    }

    // Update student XP
    if (xpEarned > 0) {
      const { data: studentData } = await supabase
        .from('students')
        .select('xp')
        .eq('id', req.studentId)
        .single();
      if (studentData) {
        await supabase.from('students').update({ xp: studentData.xp + xpEarned }).eq('id', req.studentId);
      }
      await updateStudentRank(req.studentId);
    }

    // Get updated student stats
    const { data: updatedStudent } = await supabase
      .from('students')
      .select('xp, level, rank, streak_days')
      .eq('id', req.studentId)
      .single();

    res.json({
      xpEarned,
      nextReview: srUpdate.next_review,
      intervalDays: srUpdate.interval_days,
      student: updatedStudent
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// End a session and get summary
router.post('/:sessionId/end', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    await supabase.from('sessions').update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', req.studentId);

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    const { data: weakTopics } = await supabase
      .from('mistake_patterns')
      .select('topic, error_count')
      .eq('student_id', req.studentId)
      .order('error_count', { ascending: false })
      .limit(3);

    res.json({ session, weakTopics: weakTopics || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

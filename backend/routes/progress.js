const express = require('express');
const supabase = require('../database/supabase');
const { getWeakTopics, getPerformanceBreakdown, getRecentSessions } = require('../services/analytics');
const { generateSessionFeedback } = require('../services/aiTutor');
const { authenticate } = require('./middleware');

const router = express.Router();

// Get student overview
router.get('/overview', authenticate, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      { data: student },
      { count: totalAttempts },
      { count: correctAttempts },
      { count: dueCount },
      { count: todayAttempts }
    ] = await Promise.all([
      supabase.from('students')
        .select('id, username, display_name, grade_level, xp, level, rank, streak_days, last_study_date')
        .eq('id', req.studentId).single(),
      supabase.from('session_attempts').select('*', { count: 'exact', head: true }).eq('student_id', req.studentId),
      supabase.from('session_attempts').select('*', { count: 'exact', head: true }).eq('student_id', req.studentId).gte('quality', 3),
      supabase.from('student_problem_records').select('*', { count: 'exact', head: true }).eq('student_id', req.studentId).lte('next_review', now),
      supabase.from('session_attempts').select('*', { count: 'exact', head: true }).eq('student_id', req.studentId).gte('attempted_at', today.toISOString())
    ]);

    res.json({
      student,
      stats: {
        totalAttempts: totalAttempts || 0,
        correctAttempts: correctAttempts || 0,
        accuracy: (totalAttempts || 0) > 0
          ? Math.round(100 * (correctAttempts || 0) / (totalAttempts || 0))
          : 0,
        dueForReview: dueCount || 0,
        todayAttempts: todayAttempts || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all wrong answers (오답 노트) — distinct problems, most recently wrong first
router.get('/wrong-answers', authenticate, async (req, res) => {
  try {
    const { data: attempts } = await supabase
      .from('session_attempts')
      .select('problem_id, attempted_at, problems!inner(id, grade, topic, unit, curriculum, difficulty, question_latex, answer_latex, solution_steps, hints)')
      .eq('student_id', req.studentId)
      .lt('quality', 3)
      .order('attempted_at', { ascending: false });

    const problemMap = {};
    for (const a of attempts || []) {
      const p = a.problems;
      if (!p) continue;
      if (!problemMap[p.id]) {
        problemMap[p.id] = { ...p, wrong_count: 0, last_wrong_at: null };
      }
      problemMap[p.id].wrong_count++;
      if (!problemMap[p.id].last_wrong_at || a.attempted_at > problemMap[p.id].last_wrong_at) {
        problemMap[p.id].last_wrong_at = a.attempted_at;
      }
    }

    const problems = Object.values(problemMap)
      .sort((a, b) => new Date(b.last_wrong_at) - new Date(a.last_wrong_at))
      .slice(0, 100)
      .map(p => ({
        ...p,
        hints: (() => { try { return typeof p.hints === 'string' ? JSON.parse(p.hints || '[]') : (p.hints || []) } catch { return [] } })(),
        solution_steps: (() => { try { return typeof p.solution_steps === 'string' ? JSON.parse(p.solution_steps || '[]') : (p.solution_steps || []) } catch { return [] } })()
      }));

    res.json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get recent wrong answers
router.get('/recent-wrong', authenticate, async (req, res) => {
  try {
    const { data: attempts } = await supabase
      .from('session_attempts')
      .select('id, problem_id, quality, attempted_at, problems!inner(question_latex, topic, grade, difficulty, curriculum)')
      .eq('student_id', req.studentId)
      .lt('quality', 3)
      .order('attempted_at', { ascending: false })
      .limit(3);

    const wrong = (attempts || []).map(a => ({
      id: a.id,
      problem_id: a.problem_id,
      quality: a.quality,
      attempted_at: a.attempted_at,
      question_latex: a.problems?.question_latex,
      topic: a.problems?.topic,
      grade: a.problems?.grade,
      difficulty: a.problems?.difficulty,
      curriculum: a.problems?.curriculum
    }));

    res.json({ wrong });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get weak topics
router.get('/weak-topics', authenticate, async (req, res) => {
  try {
    const weakTopics = await getWeakTopics(req.studentId);
    res.json({ weakTopics });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get performance breakdown
router.get('/breakdown', authenticate, async (req, res) => {
  try {
    const breakdown = await getPerformanceBreakdown(req.studentId);
    res.json({ breakdown });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get session history
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await getRecentSessions(req.studentId);
    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get today's review queue
router.get('/review-queue', authenticate, async (req, res) => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: records } = await supabase
      .from('student_problem_records')
      .select('next_review, ease_factor, total_attempts, correct_attempts, problems!inner(id, grade, topic, difficulty, question_latex)')
      .eq('student_id', req.studentId)
      .lte('next_review', tomorrow.toISOString())
      .order('next_review', { ascending: true })
      .limit(20);

    const queue = (records || []).map(r => ({
      id: r.problems?.id,
      grade: r.problems?.grade,
      topic: r.problems?.topic,
      difficulty: r.problems?.difficulty,
      question_latex: r.problems?.question_latex,
      next_review: r.next_review,
      ease_factor: r.ease_factor,
      total_attempts: r.total_attempts,
      correct_attempts: r.correct_attempts
    }));

    res.json({ queue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Generate AI feedback for a session
router.post('/feedback', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;

    const [{ data: session }, { data: student }, weakTopics] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).eq('student_id', req.studentId).single(),
      supabase.from('students').select('grade_level').eq('id', req.studentId).single(),
      getWeakTopics(req.studentId, 3)
    ]);

    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });

    const feedback = await generateSessionFeedback({
      attempts: { total: session.problems_attempted, correct: session.problems_correct },
      weakTopics,
      grade: student?.grade_level
    });

    res.json({ feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI 피드백 생성 중 오류가 발생했습니다.' });
  }
});

module.exports = router;

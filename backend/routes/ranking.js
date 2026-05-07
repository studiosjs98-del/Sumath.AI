const express = require('express');
const supabase = require('../database/supabase');
const { authenticate } = require('./middleware');

const router = express.Router();

const ANON_NAMES = [
  '수학왕', '미적분고수', '기하학자', '대수왕', '확률의神',
  '함수천재', '통계박사', '집합마스터', '행렬영웅', '수열달인',
  '삼각함수왕', '로그마스터', '적분천재', '미분고수', '벡터의달인'
];

// GET /ranking/me — student's own rank + subject stats
router.get('/me', authenticate, async (req, res) => {
  try {
    const [
      { count: totalStudents },
      { data: myData }
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('students').select('xp').eq('id', req.studentId).single()
    ]);

    const myXP = myData?.xp || 0;
    const { count: higherCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .gt('xp', myXP);

    const myRank = (higherCount || 0) + 1;
    const total = totalStudents || 1;
    const percentile = Math.max(1, Math.round((1 - (myRank - 1) / Math.max(total, 1)) * 100));

    // Subject stats: fetch attempts with problem curriculum info
    const { data: attempts } = await supabase
      .from('session_attempts')
      .select('quality, problems!inner(curriculum)')
      .eq('student_id', req.studentId);

    const byCurriculum = {};
    for (const a of attempts || []) {
      const cur = a.problems?.curriculum;
      if (!cur) continue;
      if (!byCurriculum[cur]) byCurriculum[cur] = { total: 0, correct: 0 };
      byCurriculum[cur].total++;
      if (a.quality >= 3) byCurriculum[cur].correct++;
    }

    const subjectStats = Object.entries(byCurriculum)
      .filter(([, s]) => s.total >= 3)
      .map(([curriculum, s]) => ({
        curriculum,
        total: s.total,
        accuracy: Math.round(100 * s.correct / s.total)
      }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 6);

    res.json({ rank: myRank, total, percentile, subjectStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /ranking/leaderboard — top 20 (anonymized)
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    const [
      { data: students },
      { count: totalStudents },
      { data: myData }
    ] = await Promise.all([
      supabase.from('students').select('id, display_name, xp, level, rank, streak_days').order('xp', { ascending: false }).limit(20),
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('students').select('xp').eq('id', req.studentId).single()
    ]);

    const myXP = myData?.xp || 0;
    const { count: higherCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .gt('xp', myXP);
    const myRank = (higherCount || 0) + 1;

    const studentIds = (students || []).map(s => s.id);
    const { data: allAttempts } = studentIds.length > 0
      ? await supabase.from('session_attempts').select('student_id, quality').in('student_id', studentIds)
      : { data: [] };

    const attemptStats = {};
    for (const a of allAttempts || []) {
      if (!attemptStats[a.student_id]) attemptStats[a.student_id] = { total: 0, correct: 0 };
      attemptStats[a.student_id].total++;
      if (a.quality >= 3) attemptStats[a.student_id].correct++;
    }

    const board = (students || []).map((s, i) => {
      const isMe = s.id === req.studentId;
      const stats = attemptStats[s.id] || { total: 0, correct: 0 };
      const accuracy = stats.total > 0 ? Math.round(100 * stats.correct / stats.total) : 0;
      return {
        rank: i + 1,
        isMe,
        displayName: isMe ? s.display_name : ANON_NAMES[i % ANON_NAMES.length],
        xp: s.xp,
        level: s.level,
        rankTitle: s.rank,
        streak: s.streak_days,
        totalAttempts: stats.total,
        accuracy
      };
    });

    res.json({ board, myRank, total: totalStudents || 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

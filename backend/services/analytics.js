const supabase = require('../database/supabase');

async function getWeakTopics(studentId, limit = 5) {
  const { data } = await supabase
    .from('mistake_patterns')
    .select('topic, curriculum, grade, error_count, last_error')
    .eq('student_id', studentId)
    .order('error_count', { ascending: false })
    .limit(limit);
  return data || [];
}

async function recordMistake(studentId, topic, curriculum, grade) {
  const { data: existing } = await supabase
    .from('mistake_patterns')
    .select('id, error_count')
    .eq('student_id', studentId)
    .eq('topic', topic)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('mistake_patterns')
      .update({ error_count: existing.error_count + 1, last_error: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('mistake_patterns').insert({
      student_id: studentId, topic, curriculum, grade,
      error_count: 1, last_error: new Date().toISOString()
    });
  }
}

async function getPerformanceBreakdown(studentId) {
  const { data: attempts } = await supabase
    .from('session_attempts')
    .select('quality, problems!inner(grade, curriculum, topic)')
    .eq('student_id', studentId);

  const grouped = {};
  for (const a of attempts || []) {
    const p = a.problems;
    if (!p) continue;
    const key = `${p.grade}::${p.curriculum}::${p.topic}`;
    if (!grouped[key]) grouped[key] = { grade: p.grade, curriculum: p.curriculum, topic: p.topic, total: 0, correct: 0, qualitySum: 0 };
    grouped[key].total++;
    if (a.quality >= 3) grouped[key].correct++;
    grouped[key].qualitySum += a.quality;
  }

  return Object.values(grouped).map(g => ({
    grade: g.grade, curriculum: g.curriculum, topic: g.topic,
    total_attempts: g.total,
    correct: g.correct,
    avg_quality: g.total > 0 ? g.qualitySum / g.total : 0
  })).sort((a, b) => a.avg_quality - b.avg_quality);
}

async function getRecentSessions(studentId, limit = 10) {
  const { data } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at, problems_attempted, problems_correct, xp_earned')
    .eq('student_id', studentId)
    .order('started_at', { ascending: false })
    .limit(limit);

  return (data || []).map(s => ({
    ...s,
    accuracy: s.problems_attempted > 0
      ? Math.round(100 * s.problems_correct / s.problems_attempted)
      : null
  }));
}

function calculateXP(quality, difficulty, hintsUsed) {
  if (quality < 3) return 0;
  const base = quality === 5 ? 20 : 10;
  const difficultyBonus = difficulty * 5;
  const hintPenalty = Math.min(hintsUsed * 3, 15);
  return Math.max(5, base + difficultyBonus - hintPenalty);
}

async function updateStudentRank(studentId) {
  const { data: student } = await supabase.from('students').select('xp').eq('id', studentId).single();
  if (!student) return;

  const xp = student.xp;
  const ranks = [
    { rank: '9급', minXp: 0 },
    { rank: '8급', minXp: 100 },
    { rank: '7급', minXp: 250 },
    { rank: '6급', minXp: 500 },
    { rank: '5급', minXp: 800 },
    { rank: '4급', minXp: 1200 },
    { rank: '3급', minXp: 1800 },
    { rank: '2급', minXp: 2600 },
    { rank: '1급', minXp: 3500 },
    { rank: '초단', minXp: 5000 },
    { rank: '1단', minXp: 7000 },
    { rank: '2단', minXp: 9500 },
    { rank: '3단', minXp: 12500 },
    { rank: '사범', minXp: 20000 }
  ];

  let currentRank = '9급';
  let level = 1;
  for (let i = 0; i < ranks.length; i++) {
    if (xp >= ranks[i].minXp) { currentRank = ranks[i].rank; level = i + 1; }
  }

  await supabase.from('students').update({ rank: currentRank, level }).eq('id', studentId);
  return { rank: currentRank, level };
}

async function updateStreak(studentId) {
  const { data: student } = await supabase
    .from('students')
    .select('last_study_date, streak_days')
    .eq('id', studentId)
    .single();
  if (!student) return;

  const today = new Date().toISOString().split('T')[0];
  const lastDate = student.last_study_date;
  let newStreak = student.streak_days;

  if (!lastDate) {
    newStreak = 1;
  } else if (lastDate === today) {
    return { streak_days: newStreak };
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    newStreak = lastDate === yesterdayStr ? newStreak + 1 : 1;
  }

  await supabase.from('students').update({ streak_days: newStreak, last_study_date: today }).eq('id', studentId);
  return { streak_days: newStreak };
}

module.exports = {
  getWeakTopics, recordMistake, getPerformanceBreakdown, getRecentSessions,
  calculateXP, updateStudentRank, updateStreak
};

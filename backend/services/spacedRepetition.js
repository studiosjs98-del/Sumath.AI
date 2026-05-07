const supabase = require('../database/supabase');

const QUALITY_MAP = {
  '틀림': 0,
  '헷갈림': 3,
  '맞음': 5
};

function calculateNextReview(qualityLabel, currentRecord) {
  const quality = QUALITY_MAP[qualityLabel] ?? 3;
  let { ease_factor, interval_days, repetitions } = currentRecord;

  if (quality < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    repetitions += 1;
    ease_factor = Math.max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  }

  interval_days = Math.min(interval_days, 365);
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval_days);

  return {
    ease_factor: parseFloat(ease_factor.toFixed(3)),
    interval_days,
    repetitions,
    next_review: nextReview.toISOString()
  };
}

async function getDueProblems(studentId, gradeFilter = null, limit = 20, topicFilter = null, curriculumFilter = null, difficultyFilter = null) {
  const now = new Date().toISOString();
  const dueLimit = Math.floor(limit * 0.6);

  const applyProblemFilter = (p) => {
    if (gradeFilter && p.grade !== gradeFilter) return false;
    if (topicFilter && p.topic !== topicFilter) return false;
    if (curriculumFilter && p.curriculum !== curriculumFilter) return false;
    if (difficultyFilter === 'basic' && p.difficulty > 2) return false;
    if (difficultyFilter === 'medium' && p.difficulty !== 3) return false;
    if (difficultyFilter === 'advanced' && p.difficulty < 4) return false;
    return true;
  };

  // Due problems (previously seen)
  const { data: dueRecords } = await supabase
    .from('student_problem_records')
    .select('ease_factor, interval_days, repetitions, last_reviewed, total_attempts, correct_attempts, problems(*)')
    .eq('student_id', studentId)
    .lte('next_review', now)
    .order('next_review', { ascending: true })
    .limit(dueLimit * 3); // fetch extra to account for filtering

  const dueProblems = (dueRecords || [])
    .map(r => ({ ...r.problems, ease_factor: r.ease_factor, interval_days: r.interval_days, repetitions: r.repetitions, last_reviewed: r.last_reviewed, total_attempts: r.total_attempts, correct_attempts: r.correct_attempts }))
    .filter(applyProblemFilter)
    .slice(0, dueLimit);

  // New problems (not yet seen)
  const seenIds = (dueRecords || []).map(r => r.problems?.id).filter(Boolean);
  const { data: allSeen } = await supabase
    .from('student_problem_records')
    .select('problem_id')
    .eq('student_id', studentId);
  const allSeenIds = (allSeen || []).map(r => r.problem_id);

  let newQuery = supabase
    .from('problems')
    .select('*')
    .order('difficulty', { ascending: true })
    .limit((limit - dueProblems.length) * 3);

  if (allSeenIds.length > 0) {
    newQuery = newQuery.not('id', 'in', `(${allSeenIds.join(',')})`);
  }

  const { data: newRaw } = await newQuery;
  const newProblems = (newRaw || [])
    .filter(applyProblemFilter)
    .slice(0, limit - dueProblems.length)
    .map(p => ({ ...p, ease_factor: 2.5, interval_days: 0, repetitions: 0, last_reviewed: null, total_attempts: 0, correct_attempts: 0 }));

  return [...dueProblems, ...newProblems];
}

async function recordAttempt(studentId, problemId, qualityLabel, hintsUsed = 0) {
  const { data: existing } = await supabase
    .from('student_problem_records')
    .select('*')
    .eq('student_id', studentId)
    .eq('problem_id', problemId)
    .maybeSingle();

  const currentRecord = existing || { ease_factor: 2.5, interval_days: 0, repetitions: 0 };
  const next = calculateNextReview(qualityLabel, currentRecord);
  const quality = QUALITY_MAP[qualityLabel] ?? 3;
  const isCorrect = quality >= 3 ? 1 : 0;
  const now = new Date().toISOString();

  if (existing) {
    await supabase.from('student_problem_records').update({
      ease_factor: next.ease_factor,
      interval_days: next.interval_days,
      repetitions: next.repetitions,
      next_review: next.next_review,
      last_reviewed: now,
      total_attempts: existing.total_attempts + 1,
      correct_attempts: existing.correct_attempts + isCorrect,
      last_quality: quality
    }).eq('student_id', studentId).eq('problem_id', problemId);
  } else {
    await supabase.from('student_problem_records').insert({
      student_id: studentId,
      problem_id: problemId,
      ease_factor: next.ease_factor,
      interval_days: next.interval_days,
      repetitions: next.repetitions,
      next_review: next.next_review,
      last_reviewed: now,
      total_attempts: 1,
      correct_attempts: isCorrect,
      last_quality: quality
    });
  }

  return next;
}

module.exports = { calculateNextReview, getDueProblems, recordAttempt, QUALITY_MAP };

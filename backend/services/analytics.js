const db = require('../database/db');

/**
 * Get weak topics for a student (most errors)
 */
function getWeakTopics(studentId, limit = 5) {
  return db.prepare(`
    SELECT mp.topic, mp.curriculum, mp.grade, mp.error_count, mp.last_error
    FROM mistake_patterns mp
    WHERE mp.student_id = ?
    ORDER BY mp.error_count DESC
    LIMIT ?
  `).all(studentId, limit);
}

/**
 * Update mistake pattern for a student
 */
function recordMistake(studentId, topic, curriculum, grade) {
  db.prepare(`
    INSERT INTO mistake_patterns (student_id, topic, curriculum, grade, error_count, last_error)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(student_id, topic) DO UPDATE SET
      error_count = error_count + 1,
      last_error = datetime('now')
  `).run(studentId, topic, curriculum, grade);
}

/**
 * Get performance breakdown by grade/curriculum
 */
function getPerformanceBreakdown(studentId) {
  return db.prepare(`
    SELECT
      p.grade, p.curriculum, p.topic,
      COUNT(*) as total_attempts,
      SUM(CASE WHEN sa.quality >= 3 THEN 1 ELSE 0 END) as correct,
      AVG(sa.quality) as avg_quality
    FROM session_attempts sa
    JOIN problems p ON sa.problem_id = p.id
    WHERE sa.student_id = ?
    GROUP BY p.grade, p.curriculum, p.topic
    ORDER BY avg_quality ASC
  `).all(studentId);
}

/**
 * Get recent session history
 */
function getRecentSessions(studentId, limit = 10) {
  return db.prepare(`
    SELECT
      s.id, s.started_at, s.ended_at,
      s.problems_attempted, s.problems_correct, s.xp_earned,
      ROUND(100.0 * s.problems_correct / NULLIF(s.problems_attempted, 0)) as accuracy
    FROM sessions s
    WHERE s.student_id = ?
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(studentId, limit);
}

/**
 * Calculate XP reward for an attempt
 */
function calculateXP(quality, difficulty, hintsUsed) {
  if (quality < 3) return 0;
  const base = quality === 5 ? 20 : 10;
  const difficultyBonus = difficulty * 5;
  const hintPenalty = Math.min(hintsUsed * 3, 15);
  return Math.max(5, base + difficultyBonus - hintPenalty);
}

/**
 * Update student level and rank based on XP
 */
function updateStudentRank(studentId) {
  const student = db.prepare('SELECT xp FROM students WHERE id = ?').get(studentId);
  if (!student) return;

  const xp = student.xp;

  // XP thresholds for ranks
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
    if (xp >= ranks[i].minXp) {
      currentRank = ranks[i].rank;
      level = i + 1;
    }
  }

  db.prepare('UPDATE students SET rank = ?, level = ? WHERE id = ?')
    .run(currentRank, level, studentId);

  return { rank: currentRank, level };
}

/**
 * Update streak
 */
function updateStreak(studentId) {
  const student = db.prepare('SELECT last_study_date, streak_days FROM students WHERE id = ?').get(studentId);
  if (!student) return;

  const today = new Date().toISOString().split('T')[0];
  const lastDate = student.last_study_date;

  let newStreak = student.streak_days;

  if (!lastDate) {
    newStreak = 1;
  } else if (lastDate === today) {
    // Already studied today, no change
    return { streak_days: newStreak };
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      newStreak += 1; // Consecutive day
    } else {
      newStreak = 1; // Streak broken
    }
  }

  db.prepare('UPDATE students SET streak_days = ?, last_study_date = ? WHERE id = ?')
    .run(newStreak, today, studentId);

  return { streak_days: newStreak };
}

module.exports = {
  getWeakTopics,
  recordMistake,
  getPerformanceBreakdown,
  getRecentSessions,
  calculateXP,
  updateStudentRank,
  updateStreak
};

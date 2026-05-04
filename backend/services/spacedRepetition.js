/**
 * SM-2 Spaced Repetition Algorithm (Math-optimized variant)
 *
 * Quality scale:
 *   틀림 (Wrong)      → quality 0
 *   헷갈림 (Unsure)    → quality 3
 *   맞음 (Correct)    → quality 5
 */

const QUALITY_MAP = {
  '틀림': 0,
  '헷갈림': 3,
  '맞음': 5
};

function calculateNextReview(qualityLabel, currentRecord) {
  const quality = QUALITY_MAP[qualityLabel] ?? 3;
  let { ease_factor, interval_days, repetitions } = currentRecord;

  // SM-2 core algorithm
  if (quality < 3) {
    // Failed: reset to beginning
    repetitions = 0;
    interval_days = 1;
  } else {
    // Passed: advance in schedule
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    repetitions += 1;

    // Update ease factor (capped at minimum 1.3)
    ease_factor = Math.max(
      1.3,
      ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
  }

  // Cap interval at 365 days
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

/**
 * Get problems due for review for a student
 * Returns: problems past their next_review date + new unseen problems
 */
function getDueProblems(db, studentId, gradeFilter = null, limit = 20, topicFilter = null, curriculumFilter = null, difficultyFilter = null) {
  const now = new Date().toISOString();

  // Build filter conditions
  const buildFilters = (prefix = 'AND') => {
    const clauses = []; const params = [];
    if (gradeFilter) { clauses.push(`p.grade = ?`); params.push(gradeFilter); }
    if (topicFilter) { clauses.push(`p.topic = ?`); params.push(topicFilter); }
    if (curriculumFilter) { clauses.push(`p.curriculum = ?`); params.push(curriculumFilter); }
    if (difficultyFilter === 'basic') { clauses.push(`p.difficulty <= 2`); }
    else if (difficultyFilter === 'medium') { clauses.push(`p.difficulty = 3`); }
    else if (difficultyFilter === 'advanced') { clauses.push(`p.difficulty >= 4`); }
    return { sql: clauses.length ? `${prefix} ${clauses.join(' AND ')}` : '', params };
  };

  // Due for review (previously seen)
  const { sql: dueFilter, params: dueFilterParams } = buildFilters('AND');
  const dueQuery = `
    SELECT p.*, spr.ease_factor, spr.interval_days, spr.repetitions,
           spr.last_reviewed, spr.total_attempts, spr.correct_attempts
    FROM problems p
    JOIN student_problem_records spr ON p.id = spr.problem_id
    WHERE spr.student_id = ? AND spr.next_review <= ?
    ${dueFilter}
    ORDER BY spr.next_review ASC LIMIT ?
  `;
  const dueProblems = db.prepare(dueQuery).all(studentId, now, ...dueFilterParams, Math.floor(limit * 0.6));

  // New problems not yet seen
  const { sql: newFilter, params: newFilterParams } = buildFilters('AND');
  const newQuery = `
    SELECT p.*, 2.5 as ease_factor, 0 as interval_days, 0 as repetitions,
           NULL as last_reviewed, 0 as total_attempts, 0 as correct_attempts
    FROM problems p
    WHERE p.id NOT IN (
      SELECT problem_id FROM student_problem_records WHERE student_id = ?
    )
    ${newFilter}
    ORDER BY p.difficulty ASC LIMIT ?
  `;
  const newProblems = db.prepare(newQuery).all(studentId, ...newFilterParams, limit - dueProblems.length);

  return [...dueProblems, ...newProblems];
}

/**
 * Record an attempt and update spaced repetition record
 */
function recordAttempt(db, studentId, problemId, qualityLabel, hintsUsed = 0) {
  const existing = db.prepare(
    'SELECT * FROM student_problem_records WHERE student_id = ? AND problem_id = ?'
  ).get(studentId, problemId);

  const currentRecord = existing || {
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0
  };

  const next = calculateNextReview(qualityLabel, currentRecord);
  const quality = QUALITY_MAP[qualityLabel] ?? 3;
  const isCorrect = quality >= 3 ? 1 : 0;

  if (existing) {
    db.prepare(`
      UPDATE student_problem_records SET
        ease_factor = ?, interval_days = ?, repetitions = ?,
        next_review = ?, last_reviewed = datetime('now'),
        total_attempts = total_attempts + 1,
        correct_attempts = correct_attempts + ?,
        last_quality = ?
      WHERE student_id = ? AND problem_id = ?
    `).run(
      next.ease_factor, next.interval_days, next.repetitions,
      next.next_review, isCorrect, quality, studentId, problemId
    );
  } else {
    db.prepare(`
      INSERT INTO student_problem_records
        (student_id, problem_id, ease_factor, interval_days, repetitions,
         next_review, last_reviewed, total_attempts, correct_attempts, last_quality)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1, ?, ?)
    `).run(
      studentId, problemId, next.ease_factor, next.interval_days, next.repetitions,
      next.next_review, isCorrect, quality
    );
  }

  return next;
}

module.exports = { calculateNextReview, getDueProblems, recordAttempt, QUALITY_MAP };

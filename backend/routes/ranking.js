const express = require('express')
const db = require('../database/db')
const { authenticate } = require('./middleware')

const router = express.Router()

const ANON_NAMES = [
  '수학왕', '미적분고수', '기하학자', '대수왕', '확률의神',
  '함수천재', '통계박사', '집합마스터', '행렬영웅', '수열달인',
  '삼각함수왕', '로그마스터', '적분천재', '미분고수', '벡터의달인'
]

// GET /ranking/me — student's own rank + subject stats
router.get('/me', authenticate, (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as cnt FROM students').get().cnt || 1
  const myXP = db.prepare('SELECT xp FROM students WHERE id = ?').get(req.studentId)?.xp || 0
  const higherCount = db.prepare('SELECT COUNT(*) as cnt FROM students WHERE xp > ?').get(myXP).cnt
  const myRank = higherCount + 1
  const percentile = Math.max(1, Math.round((1 - (myRank - 1) / Math.max(totalStudents, 1)) * 100))

  const subjectStats = db.prepare(`
    SELECT p.curriculum,
      COUNT(sa.id) as total,
      ROUND(100.0 * SUM(CASE WHEN sa.quality >= 3 THEN 1 ELSE 0 END) / COUNT(sa.id), 0) as accuracy
    FROM session_attempts sa
    JOIN problems p ON sa.problem_id = p.id
    WHERE sa.student_id = ?
    GROUP BY p.curriculum
    HAVING total >= 3
    ORDER BY accuracy DESC
    LIMIT 6
  `).all(req.studentId)

  // rank progression: compare to rank 7 days ago (approx via xp change)
  // simplified: just show current rank
  res.json({ rank: myRank, total: totalStudents, percentile, subjectStats })
})

// GET /ranking/leaderboard — top 20 (anonymized)
router.get('/leaderboard', authenticate, (req, res) => {
  const students = db.prepare(`
    SELECT id, display_name, xp, level, rank, streak_days,
      (SELECT COUNT(*) FROM session_attempts WHERE student_id = students.id) as total_attempts,
      (SELECT COUNT(*) FROM session_attempts WHERE student_id = students.id AND quality >= 3) as correct_attempts
    FROM students
    ORDER BY xp DESC
    LIMIT 20
  `).all()

  const totalStudents = db.prepare('SELECT COUNT(*) as cnt FROM students').get().cnt || 1
  const myXP = db.prepare('SELECT xp FROM students WHERE id = ?').get(req.studentId)?.xp || 0
  const myRank = db.prepare('SELECT COUNT(*) as cnt FROM students WHERE xp > ?').get(myXP).cnt + 1

  const board = students.map((s, i) => {
    const isMe = s.id === req.studentId
    const accuracy = s.total_attempts > 0 ? Math.round(100 * s.correct_attempts / s.total_attempts) : 0
    return {
      rank: i + 1,
      isMe,
      displayName: isMe ? s.display_name : ANON_NAMES[i % ANON_NAMES.length],
      xp: s.xp,
      level: s.level,
      rankTitle: s.rank,
      streak: s.streak_days,
      totalAttempts: s.total_attempts,
      accuracy
    }
  })

  res.json({ board, myRank, total: totalStudents })
})

module.exports = router

const express = require('express')
const db = require('../database/db')
const { authenticate } = require('./middleware')
const { enrichProblem } = require('./problems')

const router = express.Router()

// GET /diagnostic/questions?grade=X
router.get('/questions', authenticate, async (req, res) => {
  try {
    const { grade } = req.query
    let pool = db.prepare(`
      SELECT * FROM problems
      WHERE grade = ?
      ORDER BY difficulty, RANDOM()
      LIMIT 60
    `).all(grade || '중3')

    if (pool.length < 15) {
      const extra = db.prepare(`
        SELECT * FROM problems WHERE grade != ? ORDER BY difficulty, RANDOM() LIMIT 30
      `).all(grade || '중3')
      pool = [...pool, ...extra]
    }

    const problems = await Promise.all(pool.map(enrichProblem))
    res.json({ problems })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '진단 문제를 불러오는 중 오류가 발생했습니다.' })
  }
})

// POST /diagnostic/result
router.post('/result', authenticate, (req, res) => {
  const { grade, percentile } = req.body
  db.prepare(`
    UPDATE students SET diagnostic_done = 1, diagnostic_grade = ?, diagnostic_percentile = ? WHERE id = ?
  `).run(grade || null, percentile || null, req.studentId)

  const student = db.prepare(`
    SELECT id, username, display_name, grade_level, xp, level, rank, streak_days,
           last_study_date, diagnostic_done, diagnostic_grade, diagnostic_percentile
    FROM students WHERE id = ?
  `).get(req.studentId)

  res.json({ student })
})

module.exports = router

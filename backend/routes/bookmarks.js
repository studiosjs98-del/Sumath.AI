const express = require('express')
const db = require('../database/db')
const { authenticate } = require('./middleware')
const { enrichProblem } = require('./problems')

const router = express.Router()

// Get all bookmarked problems for student (with AI MC options)
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*
      FROM bookmarks b
      JOIN problems p ON p.id = b.problem_id
      WHERE b.student_id = ?
      ORDER BY b.created_at DESC
    `).all(req.studentId)

    const enriched = await Promise.all(rows.map(enrichProblem))

    res.json({
      bookmarks: enriched.map(p => ({ ...p, problem_id: p.id }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '복습 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// Toggle bookmark (add if not exists, remove if exists)
router.post('/:problemId', authenticate, (req, res) => {
  const { problemId } = req.params
  const existing = db.prepare(
    'SELECT id FROM bookmarks WHERE student_id = ? AND problem_id = ?'
  ).get(req.studentId, problemId)

  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE student_id = ? AND problem_id = ?')
      .run(req.studentId, problemId)
    res.json({ bookmarked: false })
  } else {
    db.prepare('INSERT INTO bookmarks (student_id, problem_id) VALUES (?, ?)')
      .run(req.studentId, problemId)
    res.json({ bookmarked: true })
  }
})

// Get all bookmark IDs
router.get('/ids', authenticate, (req, res) => {
  const rows = db.prepare(
    'SELECT problem_id FROM bookmarks WHERE student_id = ?'
  ).all(req.studentId)
  res.json({ ids: rows.map(r => r.problem_id) })
})

module.exports = router

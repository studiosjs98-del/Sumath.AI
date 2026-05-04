const express = require('express');
const { authenticate } = require('./middleware');
const db = require('../database/db');

const router = express.Router();

// List all chats for the authenticated user, newest first
router.get('/', authenticate, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, title, updated_at FROM chat_histories WHERE student_id = ? ORDER BY updated_at DESC'
    ).all(req.studentId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single chat with its full messages
router.get('/:id', authenticate, (req, res) => {
  try {
    const row = db.prepare(
      'SELECT id, title, messages FROM chat_histories WHERE id = ? AND student_id = ?'
    ).get(req.params.id, req.studentId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ id: row.id, title: row.title, messages: JSON.parse(row.messages) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new chat
router.post('/', authenticate, (req, res) => {
  try {
    const { title, messages } = req.body;
    if (!title || !Array.isArray(messages)) return res.status(400).json({ error: 'title and messages required' });
    const result = db.prepare(
      'INSERT INTO chat_histories (student_id, title, messages) VALUES (?, ?, ?)'
    ).run(req.studentId, title.slice(0, 120), JSON.stringify(messages));
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing chat's messages (and optionally title)
router.put('/:id', authenticate, (req, res) => {
  try {
    const { messages, title } = req.body;
    const existing = db.prepare('SELECT id FROM chat_histories WHERE id = ? AND student_id = ?')
      .get(req.params.id, req.studentId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (title !== undefined) {
      db.prepare(
        "UPDATE chat_histories SET messages = ?, title = ?, updated_at = datetime('now') WHERE id = ? AND student_id = ?"
      ).run(JSON.stringify(messages), title.slice(0, 120), req.params.id, req.studentId);
    } else {
      db.prepare(
        "UPDATE chat_histories SET messages = ?, updated_at = datetime('now') WHERE id = ? AND student_id = ?"
      ).run(JSON.stringify(messages), req.params.id, req.studentId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a chat
router.delete('/:id', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM chat_histories WHERE id = ? AND student_id = ?')
      .run(req.params.id, req.studentId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

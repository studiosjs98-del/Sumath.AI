const express = require('express');
const { authenticate } = require('./middleware');
const supabase = require('../database/supabase');

const router = express.Router();

// List all chats for the authenticated user, newest first
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_histories')
      .select('id, title, updated_at')
      .eq('student_id', req.studentId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single chat with its full messages
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_histories')
      .select('id, title, messages')
      .eq('id', req.params.id)
      .eq('student_id', req.studentId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    const messages = typeof data.messages === 'string' ? JSON.parse(data.messages) : data.messages;
    res.json({ id: data.id, title: data.title, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new chat
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, messages } = req.body;
    if (!title || !Array.isArray(messages)) return res.status(400).json({ error: 'title and messages required' });
    const { data, error } = await supabase
      .from('chat_histories')
      .insert({ student_id: req.studentId, title: title.slice(0, 120), messages: JSON.stringify(messages) })
      .select('id')
      .single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing chat's messages (and optionally title)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { messages, title } = req.body;
    const { data: existing } = await supabase
      .from('chat_histories')
      .select('id')
      .eq('id', req.params.id)
      .eq('student_id', req.studentId)
      .single();
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updateData = {
      messages: JSON.stringify(messages),
      updated_at: new Date().toISOString()
    };
    if (title !== undefined) updateData.title = title.slice(0, 120);

    const { error } = await supabase
      .from('chat_histories')
      .update(updateData)
      .eq('id', req.params.id)
      .eq('student_id', req.studentId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a chat
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('chat_histories')
      .delete()
      .eq('id', req.params.id)
      .eq('student_id', req.studentId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

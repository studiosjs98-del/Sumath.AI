const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../database/supabase');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sumath-secret-key';

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName, gradeLevel } = req.body;

    if (!username || !password || !displayName) {
      return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
    }

    const { data: existing } = await supabase.from('students').select('id').eq('username', username).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newStudent, error } = await supabase.from('students').insert({
      username,
      password_hash: passwordHash,
      display_name: displayName,
      grade_level: gradeLevel || '중1',
    }).select('id, username, display_name, grade_level, xp, level, rank, streak_days').single();

    if (error) throw error;

    const token = jwt.sign({ studentId: newStudent.id }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, student: newStudent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data: student } = await supabase.from('students').select('*').eq('username', username).maybeSingle();
    if (!student) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const valid = await bcrypt.compare(password, student.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ studentId: student.id }, JWT_SECRET, { expiresIn: '90d' });

    const { password_hash, ...safeStudent } = student;
    res.json({ token, student: safeStudent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: student } = await supabase.from('students')
      .select('id, username, display_name, grade_level, xp, level, rank, streak_days, last_study_date')
      .eq('id', decoded.studentId)
      .maybeSingle();

    if (!student) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({ student });
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

// Get hint mode
router.get('/hint-mode', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: student } = await supabase.from('students').select('hint_mode').eq('id', decoded.studentId).single();
    res.json({ hintMode: student.hint_mode === 1 });
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

// Update grade level
router.patch('/grade', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const { grade_level } = req.body;
    const valid = ['중1', '중2', '중3', '고1', '고2', '고3'];
    if (!grade_level || !valid.includes(grade_level)) {
      return res.status(400).json({ error: '올바른 학년을 입력해주세요.' });
    }
    await supabase.from('students').update({ grade_level }).eq('id', decoded.studentId);
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

// Save hint mode
router.patch('/hint-mode', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const { hintMode } = req.body;
    await supabase.from('students').update({ hint_mode: hintMode ? 1 : 0 }).eq('id', decoded.studentId);
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

module.exports = router;

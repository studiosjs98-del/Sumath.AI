require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('./database/db');

const authRoutes = require('./routes/auth');
const aiChatRoutes       = require('./routes/aichat');
const chatHistoryRoutes = require('./routes/chathistory');
const solverRoutes = require('./routes/solver');
const analysisRoutes = require('./routes/analysis');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'sumath_secret_key';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'sumath_session_secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth — only initialize if credentials are present
const oauthDisabled = (req, res) =>
  res.status(503).json({ error: 'Google OAuth not configured on this server.' });

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/auth/google/callback`
  }, (accessToken, refreshToken, profile, done) => {
    const googleId = profile.id;
    const displayName = profile.displayName || profile.emails?.[0]?.value?.split('@')[0] || 'Student';
    const email = profile.emails?.[0]?.value || '';

    let student = db.prepare('SELECT * FROM students WHERE google_id = ?').get(googleId);
    if (!student) {
      student = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
      if (student) {
        db.prepare('UPDATE students SET google_id = ? WHERE id = ?').run(googleId, student.id);
        student = db.prepare('SELECT * FROM students WHERE id = ?').get(student.id);
      } else {
        const username = `google_${googleId}`;
        db.prepare(`INSERT INTO students (username, password_hash, display_name, grade_level, email, google_id)
          VALUES (?, '', ?, '중1', ?, ?)`).run(username, displayName, email, googleId);
        student = db.prepare('SELECT * FROM students WHERE google_id = ?').get(googleId);
      }
    }
    return done(null, student);
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    done(null, student);
  });

  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login` }),
    (req, res) => {
      const student = req.user;
      const token = jwt.sign({ studentId: student.id }, JWT_SECRET, { expiresIn: '7d' });
      res.redirect(`${FRONTEND_URL}/?token=${token}`);
    }
  );
} else {
  console.warn('⚠️  Google OAuth disabled — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing from .env');
  app.get('/auth/google', oauthDisabled);
  app.get('/auth/google/callback', oauthDisabled);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/chat-histories', chatHistoryRoutes);
app.use('/api/solver', solverRoutes);
app.use('/api/analysis', analysisRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: '수학 마스터 서버 정상 작동 중' }));

app.listen(PORT, () => {
  console.log(`🚀 수학 마스터 서버 실행 중: http://localhost:${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const supabase = require('./database/supabase');

const authRoutes        = require('./routes/auth');
const aiChatRoutes      = require('./routes/aichat');
const chatHistoryRoutes = require('./routes/chathistory');
const solverRoutes      = require('./routes/solver');
const analysisRoutes    = require('./routes/analysis');
const sessionsRoutes    = require('./routes/sessions');
const progressRoutes    = require('./routes/progress');
const problemsRoutes    = require('./routes/problems');
const studyRoutes       = require('./routes/study');
const rankingRoutes     = require('./routes/ranking');
const diagnosticRoutes  = require('./routes/diagnostic');
const bookmarksRoutes   = require('./routes/bookmarks');
const hintsRoutes       = require('./routes/hints');
const photoRoutes       = require('./routes/photo');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'sumath_secret_key';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_URL, credentials: true }));
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
    callbackURL: `${process.env.SERVER_URL || `http://localhost:${PORT}`}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const displayName = profile.displayName || profile.emails?.[0]?.value?.split('@')[0] || 'Student';
      const email = profile.emails?.[0]?.value || '';

      let { data: student } = await supabase.from('students').select('*').eq('google_id', googleId).maybeSingle();

      if (!student) {
        const { data: byEmail } = await supabase.from('students').select('*').eq('email', email).maybeSingle();
        if (byEmail) {
          await supabase.from('students').update({ google_id: googleId }).eq('id', byEmail.id);
          const { data: updated } = await supabase.from('students').select('*').eq('id', byEmail.id).single();
          student = updated;
        } else {
          const username = `google_${googleId}`;
          const { data: newStudent, error } = await supabase.from('students').insert({
            username, password_hash: '', display_name: displayName, grade_level: '중1', email, google_id: googleId
          }).select().single();
          if (error) return done(error);
          student = newStudent;
        }
      }
      return done(null, student);
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const { data: student } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
      done(null, student);
    } catch (err) {
      done(err);
    }
  });

  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${CLIENT_URL}/login` }),
    (req, res) => {
      const student = req.user;
      const token = jwt.sign({ studentId: student.id }, JWT_SECRET, { expiresIn: '7d' });
      res.redirect(`${CLIENT_URL}/?token=${token}`);
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
app.use('/api/sessions', sessionsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/problems', problemsRoutes);
app.use('/api/study', studyRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/diagnostic', diagnosticRoutes);
app.use('/api/bookmarks', bookmarksRoutes);
app.use('/api/hints', hintsRoutes);
app.use('/api/photo', photoRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: '수학 마스터 서버 정상 작동 중' }));

app.listen(PORT, () => {
  console.log(`🚀 수학 마스터 서버 실행 중: http://localhost:${PORT}`);
});

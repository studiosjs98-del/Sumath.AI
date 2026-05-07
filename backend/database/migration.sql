-- ── Drop tables in reverse dependency order ───────────────────────────────────
DROP TABLE IF EXISTS mastery           CASCADE;
DROP TABLE IF EXISTS practice_sessions CASCADE;
DROP TABLE IF EXISTS wrong_questions   CASCADE;
DROP TABLE IF EXISTS video_cache       CASCADE;
DROP TABLE IF EXISTS chat_histories    CASCADE;
DROP TABLE IF EXISTS students          CASCADE;

-- ── students ──────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id                    SERIAL       PRIMARY KEY,
  username              TEXT         UNIQUE NOT NULL,
  password_hash         TEXT         NOT NULL,
  display_name          TEXT         NOT NULL,
  grade_level           TEXT         NOT NULL DEFAULT '중1',
  xp                    INTEGER      NOT NULL DEFAULT 0,
  level                 INTEGER      NOT NULL DEFAULT 1,
  rank                  TEXT         NOT NULL DEFAULT '9급',
  streak_days           INTEGER      NOT NULL DEFAULT 0,
  last_study_date       TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  diagnostic_done       INTEGER      NOT NULL DEFAULT 0,
  diagnostic_grade      INTEGER,
  diagnostic_percentile INTEGER,
  hint_mode             INTEGER      NOT NULL DEFAULT 0,
  google_id             TEXT,
  email                 TEXT
);
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- ── chat_histories ────────────────────────────────────────────────────────────
CREATE TABLE chat_histories (
  id         SERIAL      PRIMARY KEY,
  student_id INTEGER     NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  messages   TEXT        NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ch_student ON chat_histories(student_id, updated_at DESC);
ALTER TABLE chat_histories DISABLE ROW LEVEL SECURITY;

-- ── video_cache ───────────────────────────────────────────────────────────────
CREATE TABLE video_cache (
  cache_key  TEXT    PRIMARY KEY,
  videos     TEXT    NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
ALTER TABLE video_cache DISABLE ROW LEVEL SECURITY;

-- ── wrong_questions ───────────────────────────────────────────────────────────
CREATE TABLE wrong_questions (
  id             SERIAL      PRIMARY KEY,
  user_id        INTEGER     NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_text  TEXT        NOT NULL,
  correct_answer TEXT,
  student_answer TEXT,
  topic          TEXT,
  concept_tag    TEXT,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count  INTEGER     NOT NULL DEFAULT 1
);
CREATE INDEX idx_wq_user ON wrong_questions(user_id, timestamp DESC);
ALTER TABLE wrong_questions DISABLE ROW LEVEL SECURITY;

-- ── practice_sessions ─────────────────────────────────────────────────────────
CREATE TABLE practice_sessions (
  id        SERIAL      PRIMARY KEY,
  user_id   INTEGER     NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score     INTEGER     NOT NULL DEFAULT 0,
  total     INTEGER     NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ps_user ON practice_sessions(user_id, timestamp DESC);
ALTER TABLE practice_sessions DISABLE ROW LEVEL SECURITY;

-- ── mastery ───────────────────────────────────────────────────────────────────
CREATE TABLE mastery (
  id             SERIAL      PRIMARY KEY,
  user_id        INTEGER     NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  concept_tag    TEXT        NOT NULL,
  wrong_count    INTEGER     NOT NULL DEFAULT 0,
  correct_count  INTEGER     NOT NULL DEFAULT 0,
  mastery_level  INTEGER     NOT NULL DEFAULT 0,
  recent_results TEXT        NOT NULL DEFAULT '[]',
  last_attempted TIMESTAMPTZ,
  last_correct   TIMESTAMPTZ,
  UNIQUE(user_id, concept_tag)
);
CREATE INDEX idx_mastery_user ON mastery(user_id);
ALTER TABLE mastery DISABLE ROW LEVEL SECURITY;

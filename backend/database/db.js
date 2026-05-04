const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/sumath.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    grade_level TEXT NOT NULL DEFAULT '중1',
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    rank TEXT NOT NULL DEFAULT '9급',
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_study_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_histories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    messages TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ch_student ON chat_histories(student_id, updated_at DESC);
`);

// Video recommendation cache
db.exec(`
  CREATE TABLE IF NOT EXISTS video_cache (
    cache_key  TEXT    PRIMARY KEY,
    videos     TEXT    NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  )
`);

// Safe migrations
try { db.exec('ALTER TABLE students ADD COLUMN diagnostic_done INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE students ADD COLUMN diagnostic_grade INTEGER') } catch {}
try { db.exec('ALTER TABLE students ADD COLUMN diagnostic_percentile INTEGER') } catch {}
try { db.exec('ALTER TABLE students ADD COLUMN hint_mode INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE students ADD COLUMN google_id TEXT') } catch {}
try { db.exec('ALTER TABLE students ADD COLUMN email TEXT') } catch {}

// Weakness tracking tables
db.exec(`
  CREATE TABLE IF NOT EXISTS wrong_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    correct_answer TEXT,
    student_answer TEXT,
    topic TEXT,
    concept_tag TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    attempt_count INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    concept_tag TEXT NOT NULL,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    mastery_level INTEGER NOT NULL DEFAULT 0,
    recent_results TEXT NOT NULL DEFAULT '[]',
    last_attempted TEXT,
    last_correct TEXT,
    UNIQUE(user_id, concept_tag)
  );

  CREATE INDEX IF NOT EXISTS idx_wq_user ON wrong_questions(user_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_ps_user ON practice_sessions(user_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_mastery_user ON mastery(user_id);
`);

module.exports = db;

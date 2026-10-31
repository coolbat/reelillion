CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('daily', 'archive', 'practice')),
  date TEXT NOT NULL,
  prompt_ids TEXT NOT NULL,
  accessible INTEGER NOT NULL DEFAULT 0 CHECK(accessible IN (0, 1)),
  current_index INTEGER NOT NULL DEFAULT 0,
  deadline INTEGER NOT NULL,
  round_started_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS one_daily_per_device ON sessions(device_id, date) WHERE mode = 'daily';
CREATE INDEX IF NOT EXISTS sessions_date_mode ON sessions(date, mode, completed_at);

CREATE TABLE IF NOT EXISTS answers (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  round_index INTEGER NOT NULL,
  prompt_id TEXT NOT NULL,
  date TEXT NOT NULL,
  movie_id TEXT,
  points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 100),
  eligible INTEGER NOT NULL DEFAULT 0 CHECK(eligible IN (0, 1)),
  result_json TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, round_index)
);
CREATE INDEX IF NOT EXISTS answer_statistics ON answers(date, prompt_id, eligible, movie_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limits(expires_at);

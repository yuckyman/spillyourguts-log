CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount_oz INTEGER,
  created_at INTEGER NOT NULL,
  user_agent TEXT,
  source TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_type_created_at ON events(type, created_at);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, window_start)
);

-- Idempotency table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);


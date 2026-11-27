-- One row per checked upload. r2_key is NULL when the photo was rejected and not stored.
CREATE TABLE photo_checks (
  id TEXT PRIMARY KEY,
  r2_key TEXT,
  status TEXT NOT NULL,
  scores TEXT,
  questions_version INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_photo_checks_status_created ON photo_checks (status, created_at DESC);
CREATE INDEX idx_photo_checks_created ON photo_checks (created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  original_key TEXT NOT NULL,
  result_key TEXT,
  original_name TEXT NOT NULL,
  input_type TEXT NOT NULL,
  output_type TEXT NOT NULL,
  scale INTEGER NOT NULL CHECK (scale IN (2, 4)),
  input_bytes INTEGER NOT NULL,
  output_bytes INTEGER,
  input_width INTEGER,
  input_height INTEGER,
  output_width INTEGER,
  output_height INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

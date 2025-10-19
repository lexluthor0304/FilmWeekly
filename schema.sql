-- Issues table stores metadata for each published issue/period.
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  guidance TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  publish_at TEXT,
  submission_deadline TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_publish_at ON issues(publish_at);

CREATE TABLE IF NOT EXISTS issue_portals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_issue_portals_issue ON issue_portals(issue_id);

-- Submissions table stores author provided information and workflow status.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author_name TEXT,
  author_contact TEXT,
  location TEXT,
  shot_at TEXT,
  equipment TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  moderation_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_issue ON submissions(issue_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_moderation_status ON submissions(moderation_status);
CREATE INDEX IF NOT EXISTS idx_submissions_author ON submissions(author_name);
CREATE INDEX IF NOT EXISTS idx_submissions_location ON submissions(location);

-- Each submission can contain multiple images stored in R2.
CREATE TABLE IF NOT EXISTS submission_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  thumbnail_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_submission_images_submission ON submission_images(submission_id);

CREATE TABLE IF NOT EXISTS submission_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  voter_ip TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(submission_id, voter_ip)
);

CREATE INDEX IF NOT EXISTS idx_submission_votes_submission ON submission_votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_votes_ip ON submission_votes(voter_ip);

-- Review logs keep track of moderation decisions.
CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_logs_submission ON review_logs(submission_id);

-- Audit log for administrative actions.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- Moderation results for asynchronous content review provider.
CREATE TABLE IF NOT EXISTS moderation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  image_id INTEGER REFERENCES submission_images(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score REAL,
  reasons TEXT,
  raw_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_results_submission ON moderation_results(submission_id);

-- Administrative authentication tables.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_otp_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_user ON admin_otp_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_otp_expires ON admin_otp_challenges(expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  ip_address TEXT,
  user_agent TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

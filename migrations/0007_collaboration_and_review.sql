PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'reviewer')),
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES draft_versions(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'changes_requested', 'approved', 'cancelled')),
  summary TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  decided_by TEXT REFERENCES users(id),
  decision_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS review_requests_project_idx ON review_requests(project_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS review_requests_assignee_idx ON review_requests(assigned_to, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  review_request_id TEXT NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES draft_versions(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  anchor_text TEXT NOT NULL DEFAULT '',
  paragraph_index INTEGER,
  category TEXT NOT NULL DEFAULT 'content' CHECK (category IN ('content', 'fact', 'policy', 'format', 'wording')),
  severity TEXT NOT NULL DEFAULT 'suggestion' CHECK (severity IN ('suggestion', 'important', 'blocking')),
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS review_comments_request_idx ON review_comments(review_request_id, status, created_at);

CREATE TABLE IF NOT EXISTS citation_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_request_id TEXT NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES draft_versions(id),
  marker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid', 'unverified', 'missing')),
  source_kind TEXT,
  source_title TEXT,
  details TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS citation_checks_request_idx ON citation_checks(review_request_id, status);


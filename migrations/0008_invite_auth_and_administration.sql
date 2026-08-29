PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO departments (id, name, code, created_by)
VALUES ('default-department', '默认部门', 'DEFAULT', 'system-owner');

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 150000;
ALTER TABLE users ADD COLUMN system_role TEXT NOT NULL DEFAULT 'user' CHECK (system_role IN ('super_admin', 'admin', 'reviewer', 'user'));
ALTER TABLE users ADD COLUMN department_id TEXT REFERENCES departments(id);
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

UPDATE users SET username = CASE WHEN id = 'system-owner' THEN 'admin' ELSE 'user-' || substr(id, 1, 12) END WHERE username IS NULL;
UPDATE users SET system_role = CASE role WHEN 'owner' THEN 'super_admin' WHEN 'reviewer' THEN 'reviewer' ELSE 'user' END;
UPDATE users SET department_id = 'default-department' WHERE department_id IS NULL;
UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(lower(username));
CREATE INDEX IF NOT EXISTS users_department_idx ON users(department_id, status);
CREATE INDEX IF NOT EXISTS users_system_role_idx ON users(system_role, status);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions(token_hash, expires_at);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'reviewer', 'user')),
  department_id TEXT REFERENCES departments(id),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS invitations_status_idx ON invitations(status, expires_at);
CREATE INDEX IF NOT EXISTS invitations_department_idx ON invitations(department_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invitation_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invitation_id TEXT NOT NULL REFERENCES invitations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invitation_id, user_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_lookup_idx ON password_reset_tokens(token_hash, expires_at);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  identifier_hash TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS security_events_identifier_idx ON security_events(identifier_hash, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id, created_at DESC);

ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('personal', 'department', 'workspace'));
ALTER TABLE documents ADD COLUMN department_id TEXT REFERENCES departments(id);
UPDATE documents SET department_id = 'default-department' WHERE department_id IS NULL;
CREATE INDEX IF NOT EXISTS documents_scope_idx ON documents(workspace_id, visibility, department_id, owner_user_id, created_at DESC);

ALTER TABLE writing_projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'personal' CHECK (visibility IN ('personal', 'department', 'workspace'));
ALTER TABLE writing_projects ADD COLUMN department_id TEXT REFERENCES departments(id);
UPDATE writing_projects SET department_id = (SELECT department_id FROM users WHERE users.id = writing_projects.owner_user_id) WHERE department_id IS NULL;
CREATE INDEX IF NOT EXISTS writing_projects_scope_idx ON writing_projects(workspace_id, visibility, department_id, owner_user_id, updated_at DESC);


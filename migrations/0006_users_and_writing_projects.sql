PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'reviewer', 'editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  auth_source TEXT NOT NULL DEFAULT 'compatibility',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'reviewer', 'editor')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

INSERT OR IGNORE INTO users (id, email, display_name, role, auth_source)
VALUES ('system-owner', 'owner@local.invalid', '单人测试用户', 'owner', 'compatibility');

INSERT OR IGNORE INTO workspaces (id, name, owner_user_id)
VALUES ('default-workspace', '公文写作工作区', 'system-owner');

INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
VALUES ('default-workspace', 'system-owner', 'owner');

ALTER TABLE documents ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE documents ADD COLUMN owner_user_id TEXT REFERENCES users(id);
ALTER TABLE documents ADD COLUMN deleted_at TEXT;

UPDATE documents
SET workspace_id = COALESCE(workspace_id, 'default-workspace'),
    owner_user_id = COALESCE(owner_user_id, 'system-owner');

CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_deleted_idx ON documents(deleted_at);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  content_hash TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, version_number)
);

INSERT OR IGNORE INTO document_versions
  (document_id, version_number, object_key, content_hash, file_size, created_by, created_at)
SELECT id, 1, object_key, content_hash, file_size, COALESCE(owner_user_id, 'system-owner'), created_at
FROM documents;

CREATE TABLE IF NOT EXISTS writing_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT '工作报告',
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'materials', 'drafting', 'review', 'completed', 'archived')),
  task_json TEXT NOT NULL DEFAULT '{}',
  outline_json TEXT NOT NULL DEFAULT '[]',
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS writing_projects_workspace_idx ON writing_projects(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS writing_projects_owner_idx ON writing_projects(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_documents (
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  usage_tags TEXT NOT NULL DEFAULT '[]',
  selected_passages TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, document_id)
);

CREATE TABLE IF NOT EXISTS draft_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('ai_draft', 'edited', 'reviewed', 'final')),
  content TEXT NOT NULL,
  source_snapshot TEXT NOT NULL DEFAULT '[]',
  audit_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, version_number)
);

CREATE INDEX IF NOT EXISTS draft_versions_project_idx ON draft_versions(project_id, version_number DESC);

CREATE TABLE IF NOT EXISTS project_exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
  draft_version_id INTEGER REFERENCES draft_versions(id),
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS activity_logs_workspace_idx ON activity_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON activity_logs(entity_type, entity_id, created_at DESC);

ALTER TABLE generations ADD COLUMN project_id TEXT REFERENCES writing_projects(id);
ALTER TABLE generations ADD COLUMN created_by TEXT REFERENCES users(id);


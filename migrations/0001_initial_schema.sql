PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content TEXT NOT NULL,
  department TEXT,
  industry TEXT,
  doc_type TEXT,
  date TEXT,
  function_tag TEXT,
  vector_data TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  library_type TEXT NOT NULL DEFAULT 'reference'
);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS department_functions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_name TEXT NOT NULL,
  function_description TEXT NOT NULL,
  source_file TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paragraph_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO paragraph_types (name, description) VALUES
  ('工作背景与总体要求', '说明政策背景、现实需要、总体目标和指导原则。'),
  ('重点任务', '分条明确工作任务、责任要求和推进重点。'),
  ('实施步骤', '按时间节点说明组织推进、阶段安排和具体动作。'),
  ('保障措施', '说明组织保障、协同机制、监督评估和风险防控要求。'),
  ('结语', '形成请示、报告或动员材料的规范结尾。');

CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  reference_ids TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_assets (
  id TEXT PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  knowledge_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

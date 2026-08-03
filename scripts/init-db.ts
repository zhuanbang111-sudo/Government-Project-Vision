import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "database.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// This schema intentionally matches the columns consumed by the App Router APIs.
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content TEXT NOT NULL,
    department TEXT,
    industry TEXT,
    doc_type TEXT,
    date TEXT,
    function_tag TEXT,
    vector_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    library_type TEXT DEFAULT '语料库'
  );
  CREATE TABLE IF NOT EXISTS department_functions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_name TEXT NOT NULL,
    function_description TEXT NOT NULL,
    source_file TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS paragraph_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    topic TEXT NOT NULL,
    reference_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS knowledge_assets (
    id TEXT PRIMARY KEY,
    document_id INTEGER,
    knowledge_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);
`);
db.close();
console.log(`数据库已初始化：${dbPath}`);

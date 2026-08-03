import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "database.db");
const db = new Database(dbPath);

const createTableSql = `
  CREATE TABLE IF NOT EXISTS department_functions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_name TEXT NOT NULL,
    function_description TEXT NOT NULL,
    source_file TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

try {
  db.exec(createTableSql);
  console.log("数据表升级成功：已成功创建 'department_functions' 结构化职能表！");
} catch (error) {
  console.error("数据库升级失败:", error);
} finally {
  db.close();
}
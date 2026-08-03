import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "database.db");
const db = new Database(dbPath);

try {
  // 向已存在的 documents 数据表中添加 library_type 字段
  db.exec("ALTER TABLE documents ADD COLUMN library_type TEXT DEFAULT '语料库';");
  console.log("数据表升级成功：已成功新增 'library_type' 字段并默认填充为'语料库'！");
} catch (error: any) {
  if (error.message.includes("duplicate column name")) {
    console.log("提示：'library_type' 字段已存在，无需重复添加。");
  } else {
    console.error("数据库升级失败:", error);
  }
} finally {
  db.close();
}
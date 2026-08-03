import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "database.db");
const db = new Database(dbPath);

const createTableSql = `
  CREATE TABLE IF NOT EXISTS paragraph_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const insertInitialData = `
  INSERT OR IGNORE INTO paragraph_types (name, description) VALUES 
  ('发文依据（引言）', '描述拟写本篇公文的背景、政策依据、出发点和根本目的'),
  ('基本情况（现状情况）', '描述当前各项工作的开展情况、基本现状与阶段性成果'),
  ('存在问题（困难不足）', '描述当前实际工作中暴露出的短板、遗留问题及客观困难'),
  ('具体措施（核心动作）', '描述为解决问题而采取的具体工作做法、分工动作和任务安排'),
  ('下一步计划（时间安排）', '描述接下来的推进时序安排、进度规划及目标要求'),
  ('保障措施（组织领导）', '描述在人员、资金、制度、监督检查等层面的后盾支持安排'),
  ('结束语（工作要求）', '公文收尾，提出贯彻落实的呼吁、反馈限期或纪律性要求');
`;

try {
  db.exec(createTableSql);
  db.exec(insertInitialData);
  console.log("数据表升级成功：'paragraph_types' 段落组件表及初始数据已准备就绪！");
} catch (error) {
  console.error("数据库升级失败:", error);
} finally {
  db.close();
}
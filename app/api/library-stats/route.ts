import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export function GET() {
  try {
    const dbPath = path.join(process.cwd(), "data", "database.db");
    const db = new Database(dbPath);

    // 1. 统计 documents 表中不同 library_type 的总篇数
    const corpusCount = db.prepare("SELECT COUNT(*) AS count FROM documents WHERE library_type = '语料库'").get() as { count: number };
    const statsDbCount = db.prepare("SELECT COUNT(*) AS count FROM documents WHERE library_type = '统计数据库'").get() as { count: number };

    // 2. 统计 department_functions 表中的总条数
    const deptFuncCount = db.prepare("SELECT COUNT(*) AS count FROM department_functions").get() as { count: number };

    // 3. 统计已向量化篇数 / 总篇数
    const totalDocsCount = db.prepare("SELECT COUNT(*) AS count FROM documents").get() as { count: number };
    const vectorizedCount = db.prepare("SELECT COUNT(*) AS count FROM documents WHERE vector_data IS NOT NULL AND vector_data != ''").get() as { count: number };

    // 4. 按部门分布统计 (GROUP BY 聚合)
    const departmentDistribution = db.prepare(`
      SELECT COALESCE(department, '未知') AS name, COUNT(*) AS count 
      FROM documents 
      GROUP BY department 
      ORDER BY count DESC
    `).all() as { name: string; count: number }[];

    // 5. 按行业分布统计
    const industryDistribution = db.prepare(`
      SELECT COALESCE(industry, '未知') AS name, COUNT(*) AS count 
      FROM documents 
      GROUP BY industry 
      ORDER BY count DESC
    `).all() as { name: string; count: number }[];

    // 6. 按文种分布统计
    const docTypeDistribution = db.prepare(`
      SELECT COALESCE(doc_type, '未知') AS name, COUNT(*) AS count 
      FROM documents 
      GROUP BY doc_type 
      ORDER BY count DESC
    `).all() as { name: string; count: number }[];

    // 7. 最近 7 天新增数量统计 (利用 SQLite 的 datetime 减法函数)
    const recent7DaysCount = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM documents 
      WHERE created_at >= datetime('now', '-7 days')
    `).get() as { count: number };

    db.close();

    return NextResponse.json({
      corpusCount: corpusCount.count,
      statsDbCount: statsDbCount.count,
      deptFuncCount: deptFuncCount.count,
      vectorizedTotal: vectorizedCount.count,
      documentsTotal: totalDocsCount.count,
      departmentDistribution,
      industryDistribution,
      docTypeDistribution,
      recent7DaysCount: recent7DaysCount.count,
    });
  } catch (error: any) {
    console.error("统计看板接口异常:", error);
    return NextResponse.json({ error: error.message || "内部错误" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export async function GET() {
  try {
    const dbPath = path.join(process.cwd(), "data", "database.db");
    const db = new Database(dbPath);

    // 分别调取数据库中公文、职责和已生成历史的实际总数
    const docCount = db.prepare("SELECT COUNT(*) AS count FROM documents").get() as { count: number };
    const funcCount = db.prepare("SELECT COUNT(*) AS count FROM department_functions").get() as { count: number };
    const genCount = db.prepare("SELECT COUNT(*) AS count FROM generations").get() as { count: number };

    db.close();

    return NextResponse.json({
      docCount: docCount?.count || 0,
      funcCount: funcCount?.count || 0,
      genCount: genCount?.count || 0,
    });
  } catch {
    return NextResponse.json({ docCount: 0, funcCount: 0, genCount: 0 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

interface Params {
  id: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> | Params }
) {
  try {
    // 兼容 Next.js 14/15 版本的动态路由参数解析
    const resolvedParams = await params;
    const id = resolvedParams.id;

    // 获取前端提交的修正字段数据
    const { department, industry, doc_type, date, function_tag } = await request.json();

    const dbPath = path.join(process.cwd(), "data", "database.db");
    const db = new Database(dbPath);

    // 更新文档的分类字段，并强制将 verified 状态变更为 1 (已核实)
    const updateStatement = db.prepare(`
      UPDATE documents
      SET department = ?, industry = ?, doc_type = ?, date = ?, function_tag = ?, verified = 1
      WHERE id = ?
    `);

    updateStatement.run(department, industry, doc_type, date, function_tag, id);
    db.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
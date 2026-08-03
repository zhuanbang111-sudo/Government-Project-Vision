import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";
import { errorMessage } from "../../_shared";

type UpdatePayload = { department?: unknown; industry?: unknown; doc_type?: unknown; date?: unknown; function_tag?: unknown };
const nullableText = (value: unknown) => typeof value === "string" ? value.trim() || null : null;

export async function PATCH(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const { id } = await context.params;
    const documentId = Number(id);
    if (!Number.isInteger(documentId) || documentId < 1) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const body = await request.json() as UpdatePayload;
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    try {
      const result = db.prepare("UPDATE documents SET department = ?, industry = ?, doc_type = ?, date = ?, function_tag = ? WHERE id = ?")
        .run(nullableText(body.department), nullableText(body.industry), nullableText(body.doc_type), nullableText(body.date), nullableText(body.function_tag), documentId);
      if (!result.changes) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    } finally { db.close(); }
    return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const { id } = await context.params;
    const documentId = Number(id);
    if (!Number.isInteger(documentId) || documentId < 1) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    let filePath: string | null = null;
    try {
      const document = db.prepare("SELECT file_path FROM documents WHERE id = ?").get(documentId) as { file_path: string | null } | undefined;
      if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
      filePath = document.file_path;
      const remove = db.transaction(() => {
        db.prepare("DELETE FROM knowledge_assets WHERE document_id = ?").run(documentId);
        db.prepare("DELETE FROM documents WHERE id = ?").run(documentId);
      });
      remove();
    } finally { db.close(); }

    let fileRemoved = false;
    if (filePath) {
      const processedRoot = path.resolve(process.cwd(), "data", "processed");
      const resolvedFile = path.resolve(filePath);
      if (resolvedFile.startsWith(`${processedRoot}${path.sep}`)) {
        try { await fs.unlink(resolvedFile); fileRemoved = true; }
        catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Document record deleted but file cleanup failed:", error); }
      }
    }
    return NextResponse.json({ success: true, fileRemoved });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

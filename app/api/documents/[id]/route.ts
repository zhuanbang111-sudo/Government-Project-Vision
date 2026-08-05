import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "../../_shared";
import { getPlatformEnv } from "../../_platform";

type UpdatePayload = { department?: unknown; industry?: unknown; doc_type?: unknown; date?: unknown; function_tag?: unknown };
const nullableText = (value: unknown) => typeof value === "string" ? value.trim() || null : null;
const readId = (id: string) => { const value = Number(id); return Number.isInteger(value) && value > 0 ? value : null; };

export async function PATCH(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const body = await request.json() as UpdatePayload;
    const { APP_DB } = await getPlatformEnv();
    const result = await APP_DB.prepare("UPDATE documents SET department = ?, industry = ?, doc_type = ?, date = ?, function_tag = ? WHERE id = ?")
      .bind(nullableText(body.department), nullableText(body.industry), nullableText(body.doc_type), nullableText(body.date), nullableText(body.function_tag), id).run();
    if (!result.meta.changes) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const document = await APP_DB.prepare("SELECT object_key FROM documents WHERE id = ?").bind(id).first<{ object_key: string }>();
    if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    await APP_DB.batch([
      APP_DB.prepare("DELETE FROM knowledge_assets WHERE document_id = ?").bind(id),
      APP_DB.prepare("DELETE FROM documents WHERE id = ?").bind(id),
    ]);
    await DOCUMENTS_BUCKET.delete(document.object_key);
    return NextResponse.json({ success: true, fileRemoved: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

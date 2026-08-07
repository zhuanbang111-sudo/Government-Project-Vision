import { NextRequest, NextResponse } from "next/server";
import { normalizeDocumentType, normalizeTopicTags, normalizeUsageTags } from "../../../knowledge";
import { errorMessage } from "../../_shared";
import { getPlatformEnv } from "../../_platform";

type UpdatePayload = {
  department?: unknown;
  documentType?: unknown;
  usageTags?: unknown;
  topicTags?: unknown;
  processingStatus?: unknown;
  verificationStatus?: unknown;
};

const readId = (id: string) => {
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export async function GET(_request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const { APP_DB } = await getPlatformEnv();
    const document = await APP_DB.prepare(
      `SELECT id, filename, content, file_size, department, document_type, usage_tags, topic_tags,
              processing_status, vector_status, verification_status, created_at, updated_at
       FROM documents WHERE id = ?`,
    ).bind(id).first();
    if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    return NextResponse.json(document);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const body = await request.json() as UpdatePayload;
    const department = typeof body.department === "string" ? body.department.trim().slice(0, 100) || "未分类" : "未分类";
    const documentType = normalizeDocumentType(body.documentType);
    const usageTags = normalizeUsageTags(body.usageTags);
    const topicTags = normalizeTopicTags(body.topicTags);
    const processingStatus = typeof body.processingStatus === "string" && ["ready", "failed", "disabled"].includes(body.processingStatus)
      ? body.processingStatus : "ready";
    const verificationStatus = body.verificationStatus === "verified" ? "verified" : "unverified";
    if (!usageTags.length) return NextResponse.json({ error: "请至少选择一种使用用途" }, { status: 400 });

    const { APP_DB } = await getPlatformEnv();
    const metadata = JSON.stringify({ usageTags, topicTags, verificationStatus });
    const result = await APP_DB.prepare(
      `UPDATE documents SET department = ?, document_type = ?, usage_tags = ?, topic_tags = ?,
       processing_status = ?, verification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(department, documentType, JSON.stringify(usageTags), JSON.stringify(topicTags), processingStatus, verificationStatus, id).run();
    if (!result.meta.changes) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    await APP_DB.prepare("UPDATE knowledge_assets SET knowledge_type = ?, metadata = ?, source = ? WHERE document_id = ?")
      .bind(documentType, metadata, department, id).run();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
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
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

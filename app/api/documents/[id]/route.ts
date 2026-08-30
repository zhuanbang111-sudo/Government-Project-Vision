import { NextRequest, NextResponse } from "next/server";
import { normalizeDocumentType, normalizeTopicTags, normalizeUsageTags } from "../../../knowledge";
import { errorMessage } from "../../_shared";
import { getPlatformEnv } from "../../_platform";
import { documentScope, identityError, resolveIdentity, writeActivity } from "../../_identity";

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

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const { APP_DB } = await getPlatformEnv();
    const identity = await resolveIdentity(request, APP_DB);
    const scope = documentScope(identity, "documents");
    const document = await APP_DB.prepare(
      `SELECT id, filename, content, file_size, department, document_type, usage_tags, topic_tags,
              processing_status, vector_status, verification_status, created_at, updated_at
       FROM documents WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND ${scope.sql}`,
    ).bind(id, identity.workspaceId, ...scope.bindings).first();
    if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    return NextResponse.json(document);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
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
    const identity = await resolveIdentity(request, APP_DB);
    const writable = "owner_user_id = ?";
    const writableBindings = [identity.userId];
    const metadata = JSON.stringify({ usageTags, topicTags, verificationStatus });
    const result = await APP_DB.prepare(
      `UPDATE documents SET department = ?, document_type = ?, usage_tags = ?, topic_tags = ?,
       processing_status = ?, verification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND ${writable}`,
    ).bind(department, documentType, JSON.stringify(usageTags), JSON.stringify(topicTags), processingStatus, verificationStatus, id, identity.workspaceId, ...writableBindings).run();
    if (!result.meta.changes) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    await APP_DB.prepare("UPDATE knowledge_assets SET knowledge_type = ?, metadata = ?, source = ? WHERE document_id = ?")
      .bind(documentType, metadata, department, id).run();
    await writeActivity(APP_DB, identity, "document.updated", "document", id, { documentType, verificationStatus, processingStatus });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  try {
    const id = readId((await context.params).id);
    if (!id) return NextResponse.json({ error: "无效文档 ID" }, { status: 400 });
    const { APP_DB } = await getPlatformEnv();
    const identity = await resolveIdentity(request, APP_DB);
    const writable = "owner_user_id = ?";
    const writableBindings = [identity.userId];
    const document = await APP_DB.prepare(`SELECT object_key FROM documents WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND ${writable}`).bind(id, identity.workspaceId, ...writableBindings).first<{ object_key: string }>();
    if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    await APP_DB.prepare(`UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, processing_status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND ${writable}`)
      .bind(id, identity.workspaceId, ...writableBindings).run();
    await writeActivity(APP_DB, identity, "document.archived", "document", id, { objectKey: document.object_key });
    return NextResponse.json({ success: true, fileRemoved: false, recoverable: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

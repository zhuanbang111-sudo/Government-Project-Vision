import { NextRequest, NextResponse } from "next/server";
import { inferKnowledgeMetadata, normalizeDocumentType, normalizeTopicTags, normalizeUsageTags } from "../../knowledge";
import { getPlatformEnv } from "../_platform";
import { identityError, resolveIdentity, writeActivity } from "../_identity";

const MAX_DOCX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 1_000_000;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "上传处理失败";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const extractedContents = formData.getAll("extractedContents");
    const fileHashes = formData.getAll("fileHashes");
    if (!files.length) return NextResponse.json({ error: "请至少选择一个文件" }, { status: 400 });
    if (files.length !== extractedContents.length || files.length !== fileHashes.length) {
      return NextResponse.json({ error: "文档解析信息不完整，请刷新页面后重新上传" }, { status: 400 });
    }

    const department = String(formData.get("department") || "未分类").trim().slice(0, 100) || "未分类";
    const requestedType = formData.get("documentType");
    const requestedUsageTags = normalizeUsageTags(formData.get("usageTags"));
    const topicTags = normalizeTopicTags(formData.get("topicTags"));
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const identity = await resolveIdentity(request, APP_DB);
    const requestedVisibility = String(formData.get("visibility") || "department");
    const visibility = requestedVisibility === "personal" || requestedVisibility === "workspace" ? requestedVisibility : "department";
    const details: Array<{ filename: string; status: "success" | "fail"; message: string; id?: number }> = [];

    for (const [index, file] of files.entries()) {
      let objectKey: string | null = null;
      try {
        if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("目前仅支持 DOCX 文件");
        if (file.size > MAX_DOCX_FILE_BYTES) throw new Error("单个 DOCX 文件不能超过 8MB");
        const extracted = extractedContents[index];
        const fileHash = fileHashes[index];
        if (typeof extracted !== "string" || typeof fileHash !== "string" || !/^[a-f0-9]{64}$/i.test(fileHash)) {
          throw new Error("文档解析信息无效，请重新选择文件");
        }
        const duplicate = await APP_DB.prepare("SELECT id, filename FROM documents WHERE workspace_id = ? AND content_hash = ? AND deleted_at IS NULL LIMIT 1")
          .bind(identity.workspaceId, fileHash).first<{ id: number; filename: string }>();
        if (duplicate) throw new Error(`该文件与“${duplicate.filename}”内容重复`);

        const content = extracted.trim();
        if (content.length > MAX_EXTRACTED_CONTENT_CHARS) throw new Error("文档正文过长，请拆分后上传");
        if (content.replace(/\s/g, "").length < 30) throw new Error("未提取到足够文本；扫描件请先进行 OCR 识别");
        const inferred = inferKnowledgeMetadata(file.name, content);
        const documentType = requestedType ? normalizeDocumentType(requestedType) : inferred.documentType;
        const usageTags = requestedUsageTags.length ? requestedUsageTags : inferred.usageTags;

        const bytes = await file.arrayBuffer();
        objectKey = `documents/${crypto.randomUUID()}.docx`;
        await DOCUMENTS_BUCKET.put(objectKey, bytes, {
          httpMetadata: { contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        });
        const created = await APP_DB.prepare(
          `INSERT INTO documents
            (filename, object_key, file_type, content, department, library_type, file_size, document_type,
             usage_tags, topic_tags, processing_status, vector_status, verification_status, content_hash, updated_at,
             workspace_id, owner_user_id, visibility, department_id)
           VALUES (?, ?, 'docx', ?, ?, 'reference', ?, ?, ?, ?, 'ready', 'pending', 'unverified', ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
        ).bind(
          file.name,
          objectKey,
          content,
          department,
          file.size,
          documentType,
          JSON.stringify(usageTags),
          JSON.stringify(topicTags),
          fileHash,
          identity.workspaceId,
          identity.userId,
          visibility,
          identity.departmentId,
        ).run();
        const documentId = Number(created.meta.last_row_id);
        await APP_DB.prepare(
          "INSERT INTO knowledge_assets (id, document_id, knowledge_type, title, content, metadata, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          documentId,
          documentType,
          file.name,
          content,
          JSON.stringify({ usageTags, topicTags, fileSize: file.size, objectKey, verificationStatus: "unverified" }),
          department,
        ).run();
        await APP_DB.prepare(`INSERT INTO document_versions
          (document_id, version_number, object_key, content_hash, file_size, created_by)
          VALUES (?, 1, ?, ?, ?, ?)`).bind(documentId, objectKey, fileHash, file.size, identity.userId).run();
        await writeActivity(APP_DB, identity, "document.uploaded", "document", documentId, { filename: file.name, fileSize: file.size, documentType });
        details.push({ filename: file.name, status: "success", message: "原文件已存入 R2，知识元数据已写入 D1", id: documentId });
      } catch (error: unknown) {
        if (objectKey) await DOCUMENTS_BUCKET.delete(objectKey).catch(() => undefined);
        details.push({ filename: file.name, status: "fail", message: errorMessage(error) });
      }
    }

    const successCount = details.filter((item) => item.status === "success").length;
    return NextResponse.json({
      success: successCount === files.length,
      successCount,
      failCount: files.length - successCount,
      skipCount: 0,
      details,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

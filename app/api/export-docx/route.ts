import { NextRequest, NextResponse } from "next/server";
import { AlignmentType, convertMillimetersToTwip, Document, LineRuleType, Packer, Paragraph, TextRun } from "docx";
import { getPlatformEnv } from "../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../_identity";

const THREE_POINT_SIZE = 32;
const SECOND_POINT_SIZE = 44;
const EXACT_LINE_SPACING_28PT = 560;
const TWO_CHARACTER_INDENT = 640;
const MAX_REQUEST_BYTES = 400_000;
const MAX_CONTENT_CHARACTERS = 120_000;

type ParagraphLevel = "heading1" | "heading2" | "heading3" | "body";

class RequestSizeError extends Error {}

async function readBoundedJson(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new RequestSizeError("导出内容过大，单次最多支持约 12 万字");
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestSizeError("导出内容过大，单次最多支持约 12 万字");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as unknown; } catch { return null; }
}

function paragraphLevel(text: string): ParagraphLevel {
  if (/^[一二三四五六七八九十百]+、/.test(text)) return "heading1";
  if (/^（[一二三四五六七八九十百]+）/.test(text)) return "heading2";
  if (/^\d+[.．、]/.test(text)) return "heading3";
  return "body";
}

function createContentParagraph(text: string) {
  const level = paragraphLevel(text);
  const fonts: Record<ParagraphLevel, string> = {
    heading1: "黑体",
    heading2: "楷体_GB2312",
    heading3: "仿宋_GB2312",
    body: "仿宋_GB2312",
  };
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    keepNext: level !== "body",
    keepLines: true,
    widowControl: true,
    indent: level === "body" ? { firstLine: TWO_CHARACTER_INDENT } : undefined,
    spacing: { before: 0, after: 0, line: EXACT_LINE_SPACING_28PT, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text, font: fonts[level], size: THREE_POINT_SIZE, bold: false, color: "000000" })],
  });
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "公文材料";
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson(request) as { title?: unknown; content?: unknown; projectId?: unknown; draftVersionId?: unknown } | null;
    if (typeof body?.title !== "string" || typeof body?.content !== "string" || !body.title.trim() || !body.content.trim()) return NextResponse.json({ error: "标题和正文不能为空" }, { status: 400 });
    if (body.title.length > 200 || body.content.length > MAX_CONTENT_CHARACTERS) return NextResponse.json({ error: "导出内容过大，标题最多 200 字，正文最多 12 万字" }, { status: 413 });
    const paragraphs = body.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(createContentParagraph);
    const document = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(37),
              bottom: convertMillimetersToTwip(35),
              left: convertMillimetersToTwip(28),
              right: convertMillimetersToTwip(26),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            keepLines: true,
            spacing: { before: 0, after: EXACT_LINE_SPACING_28PT, line: EXACT_LINE_SPACING_28PT, lineRule: LineRuleType.EXACT },
            children: [new TextRun({ text: body.title.trim(), bold: false, font: "方正小标宋简体", size: SECOND_POINT_SIZE, color: "000000" })],
          }),
          ...paragraphs,
        ],
      }],
    });
    const buffer = await Packer.toBuffer(document);
    const bytes = new Uint8Array(buffer);
    const filename = `${safeFilename(body.title)}.docx`;
    let exportId: string | null = null;
    if (typeof body.projectId === "string" && body.projectId) {
      const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
      const identity = await resolveIdentity(request, APP_DB);
      await requireProjectAccess(APP_DB, identity, body.projectId, "viewer");
      const project = await APP_DB.prepare("SELECT id, current_version_id FROM writing_projects WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
        .bind(body.projectId, identity.workspaceId).first<{ id: string; current_version_id: number | null }>();
      if (!project) return NextResponse.json({ error: "写作项目不存在或无权访问" }, { status: 404 });
      exportId = crypto.randomUUID();
      const hashBytes = await crypto.subtle.digest("SHA-256", bytes);
      const contentHash = [...new Uint8Array(hashBytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
      const objectKey = `projects/${body.projectId}/exports/${exportId}.docx`;
      await DOCUMENTS_BUCKET.put(objectKey, bytes, {
        httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` },
        customMetadata: { projectId: body.projectId, exportId, contentHash },
      });
      const requestedVersionId = Number.isInteger(body.draftVersionId) ? Number(body.draftVersionId) : project.current_version_id;
      await APP_DB.prepare(`INSERT INTO project_exports
        (id, project_id, draft_version_id, object_key, filename, content_hash, file_size, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(exportId, body.projectId, requestedVersionId, objectKey, filename, contentHash, bytes.byteLength, identity.userId).run();
      await writeActivity(APP_DB, identity, "project.exported_docx", "writing_project", body.projectId, { exportId, filename, fileSize: bytes.byteLength });
    }
    return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, ...(exportId ? { "X-Project-Export-Id": exportId } : {}) } });
  } catch (error) {
    if (error instanceof RequestSizeError) return NextResponse.json({ error: error.message }, { status: 413 });
    console.error("DOCX export failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "DOCX 导出失败" }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

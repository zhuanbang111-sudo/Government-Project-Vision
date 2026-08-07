import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "../_platform";

const supportedExtensions = new Set([".docx"]);
const MAX_DOCX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 1_000_000;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "上传处理失败";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const extractedContents = formData.getAll("extractedContents");

    if (!files.length) {
      return NextResponse.json({ error: "请至少选择一个文件" }, { status: 400 });
    }
    if (files.length !== extractedContents.length) {
      return NextResponse.json({ error: "缺少文档正文，请刷新页面后重新上传" }, { status: 400 });
    }

    const department = typeof formData.get("department") === "string" ? String(formData.get("department")) : "未分类";
    const libraryType = typeof formData.get("libraryType") === "string" ? String(formData.get("libraryType")) : "reference";
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const details: Array<{ filename: string; status: "success" | "fail"; message: string }> = [];

    for (const [index, file] of files.entries()) {
      let objectKey: string | null = null;
      try {
        const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!supportedExtensions.has(extension)) throw new Error("目前仅支持 DOCX 文件");
        if (file.size > MAX_DOCX_FILE_BYTES) throw new Error("单个 DOCX 文件不能超过 8MB");

        const extracted = extractedContents[index];
        if (typeof extracted !== "string") throw new Error("缺少文档正文，请刷新页面后重新上传");
        const content = extracted.trim();
        if (content.length > MAX_EXTRACTED_CONTENT_CHARS) throw new Error("文档正文过长，请拆分后上传");
        if (content.replace(/\s/g, "").length < 30) {
          throw new Error("未提取到足够文本；扫描件请先进行 OCR 识别");
        }

        const bytes = await file.arrayBuffer();
        objectKey = `documents/${crypto.randomUUID()}${extension}`;
        await DOCUMENTS_BUCKET.put(objectKey, bytes, {
          httpMetadata: {
            contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        });
        const created = await APP_DB.prepare(
          "INSERT INTO documents (filename, object_key, file_type, content, department, library_type) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(file.name, objectKey, extension.slice(1), content, department, libraryType).run();
        await APP_DB.prepare(
          "INSERT INTO knowledge_assets (id, document_id, knowledge_type, title, content, metadata, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          created.meta.last_row_id ?? null,
          "document",
          file.name,
          content,
          JSON.stringify({ fileType: extension.slice(1), objectKey }),
          department,
        ).run();
        details.push({ filename: file.name, status: "success", message: "已保存到 R2，并写入 D1 检索索引" });
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
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

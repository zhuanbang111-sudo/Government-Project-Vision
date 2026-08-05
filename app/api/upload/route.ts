import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { getPlatformEnv } from "../_platform";

const supportedExtensions = new Set([".docx"]);
const message = (error: unknown) => error instanceof Error ? error.message : "上传处理失败";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = [...formData.getAll("files"), formData.get("file")].filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: "请至少选择一个文件" }, { status: 400 });
    const department = typeof formData.get("department") === "string" ? String(formData.get("department")) : "未分类";
    const libraryType = typeof formData.get("libraryType") === "string" ? String(formData.get("libraryType")) : "reference";
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const details: Array<{ filename: string; status: "success" | "fail"; message: string }> = [];
    for (const file of files) {
      try {
        const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!supportedExtensions.has(extension)) throw new Error("目前仅支持 DOCX 文件");
        const bytes = await file.arrayBuffer();
        const content = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.trim();
        if (content.replace(/\s/g, "").length < 30) throw new Error("未提取到足够文本；扫描件请先进行 OCR");
        const objectKey = `documents/${crypto.randomUUID()}${extension}`;
        await DOCUMENTS_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } });
        const created = await APP_DB.prepare("INSERT INTO documents (filename, object_key, file_type, content, department, library_type) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(file.name, objectKey, extension.slice(1), content, department, libraryType).run();
        await APP_DB.prepare("INSERT INTO knowledge_assets (id, document_id, knowledge_type, title, content, metadata, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), created.meta.last_row_id ?? null, "document", file.name, content, JSON.stringify({ fileType: extension.slice(1), objectKey }), department).run();
        details.push({ filename: file.name, status: "success", message: "已保存到 R2，并写入 D1 检索索引" });
      } catch (error: unknown) { details.push({ filename: file.name, status: "fail", message: message(error) }); }
    }
    const successCount = details.filter((item) => item.status === "success").length;
    return NextResponse.json({ success: successCount === files.length, successCount, failCount: files.length - successCount, skipCount: 0, details });
  } catch (error: unknown) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}

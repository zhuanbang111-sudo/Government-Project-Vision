import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import mammoth from "mammoth";

const supportedExtensions = new Set([".docx"]);

function message(error: unknown) {
  return error instanceof Error ? error.message : "上传处理失败";
}

async function extractText(file: File, extension: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (extension === ".docx") return (await mammoth.extractRawText({ buffer })).value.trim();
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = [...formData.getAll("files"), formData.get("file")].filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: "请至少选择一个文件" }, { status: 400 });

    const department = typeof formData.get("department") === "string" ? String(formData.get("department")) : "未分类";
    const libraryType = typeof formData.get("libraryType") === "string" ? String(formData.get("libraryType")) : "语料库";
    const outputDir = path.join(process.cwd(), "data", "processed", libraryType);
    fs.mkdirSync(outputDir, { recursive: true });
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    const insert = db.prepare(`INSERT INTO documents (filename, file_path, file_type, content, department, library_type) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertAsset = db.prepare(`INSERT INTO knowledge_assets (id, document_id, knowledge_type, title, content, metadata, source) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const details: Array<{ filename: string; status: "success" | "fail"; message: string }> = [];

    try {
      for (const file of files) {
        try {
          const extension = path.extname(file.name).toLowerCase();
          if (!supportedExtensions.has(extension)) throw new Error("目前仅支持 DOCX；PDF 请通过目录监听服务导入");
          const content = await extractText(file, extension);
          if (content.replace(/\s/g, "").length < 30) throw new Error("未提取到足够文本；扫描件请先进行 OCR");
          const storedName = `${path.basename(file.name, extension)}_${crypto.randomUUID()}${extension}`;
          const storedPath = path.join(outputDir, storedName);
          fs.writeFileSync(storedPath, Buffer.from(await file.arrayBuffer()));
          const result = insert.run(file.name, storedPath, extension.slice(1), content, department, libraryType);
          insertAsset.run(crypto.randomUUID(), Number(result.lastInsertRowid), "document", file.name, content, JSON.stringify({ fileType: extension.slice(1) }), department);
          details.push({ filename: file.name, status: "success", message: "已导入，等待向量回填" });
        } catch (error: unknown) {
          details.push({ filename: file.name, status: "fail", message: message(error) });
        }
      }
    } finally { db.close(); }
    const successCount = details.filter((item) => item.status === "success").length;
    return NextResponse.json({ success: successCount === files.length, successCount, failCount: files.length - successCount, skipCount: 0, details });
  } catch (error: unknown) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

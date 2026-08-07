"use client";

import mammoth from "mammoth";

export const MAX_DOCX_FILE_BYTES = 8 * 1024 * 1024;

export type UploadResponse = {
  success: boolean;
  successCount: number;
  failCount: number;
  details: Array<{ filename: string; status: "success" | "fail"; message: string }>;
  error?: string;
};

function validateDocx(file: File) {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("目前仅支持 DOCX 文件");
  }
  if (file.size > MAX_DOCX_FILE_BYTES) {
    throw new Error("单个 DOCX 文件不能超过 8MB");
  }
}

export async function appendDocxFiles(formData: FormData, files: Iterable<File>) {
  for (const file of files) {
    validateDocx(file);
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const content = value.trim();
    if (content.replace(/\s/g, "").length < 30) {
      throw new Error("未提取到足够文本；扫描件请先进行 OCR 识别");
    }
    formData.append("files", file);
    formData.append("extractedContents", content);
  }
}

export async function readUploadResponse(response: Response): Promise<UploadResponse> {
  const raw = await response.text();
  let payload: UploadResponse | null = null;
  try {
    payload = JSON.parse(raw) as UploadResponse;
  } catch {
    // Keep a useful status error when a proxy or Worker cannot return JSON.
  }

  if (!response.ok) {
    throw new Error(payload?.error || `上传失败（${response.status}），请稍后重试`);
  }
  if (!payload) throw new Error("上传服务返回了无效响应，请稍后重试");
  return payload;
}

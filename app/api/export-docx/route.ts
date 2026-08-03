import { NextRequest, NextResponse } from "next/server";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "公文材料";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { title?: unknown; content?: unknown } | null;
  if (typeof body?.title !== "string" || typeof body?.content !== "string" || !body.title.trim() || !body.content.trim()) return NextResponse.json({ error: "标题和正文不能为空" }, { status: 400 });
  const paragraphs = body.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => new Paragraph({ children: [new TextRun({ text: line, font: "仿宋_GB2312", size: 32 })], indent: { firstLine: 640 }, spacing: { line: 480, after: 0 } }));
  const document = new Document({ sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 2016, right: 2016 } } }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun({ text: body.title.trim(), bold: true, font: "方正小标宋简体", size: 44 })] }), ...paragraphs] }] });
  const buffer = await Packer.toBuffer(document);
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(body.title))}.docx` } });
}

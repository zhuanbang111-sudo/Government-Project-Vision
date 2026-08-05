import { NextResponse } from "next/server";

// The legacy multipart workflow depended on a local SQLite file. New clients use
// /api/generate-v3, which reads D1-backed reference documents and is Worker-safe.
export async function POST() {
  return NextResponse.json({ error: "该旧版接口已迁移，请使用 /api/generate-v3。" }, { status: 410 });
}

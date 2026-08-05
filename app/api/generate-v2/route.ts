import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "该旧版接口已迁移，请使用 /api/generate-v3。" }, { status: 410 });
}

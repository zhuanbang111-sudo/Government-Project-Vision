import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null }, { headers: { "Cache-Control": "public, max-age=300" } });
}


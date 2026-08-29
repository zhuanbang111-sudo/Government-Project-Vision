import { NextResponse } from "next/server";
import { getDatabase } from "../../_platform";

export async function GET() {
  const db = await getDatabase();
  const internalInvite = await db.prepare(`SELECT public_code AS code, public_label AS label, expires_at,
      max_uses - used_count AS remaining_uses
    FROM invitations
    WHERE public_display = 1 AND public_code IS NOT NULL AND status = 'active'
      AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP AND used_count < max_uses
    ORDER BY created_at DESC LIMIT 1`).first<{ code: string; label: string; expires_at: string; remaining_uses: number }>();
  return NextResponse.json({
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null,
    internalInvite: internalInvite ? {
      code: internalInvite.code,
      label: internalInvite.label || "内部试用邀请码",
      expiresAt: internalInvite.expires_at,
      remainingUses: internalInvite.remaining_uses,
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

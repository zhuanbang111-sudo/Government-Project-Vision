import { NextRequest, NextResponse } from "next/server";
import { createPasswordHash, enforceSameOrigin, hashText, validatePassword, writeSecurityEvent } from "../../_auth";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function POST(request: NextRequest) {
  enforceSameOrigin(request);
  const db = await getDatabase();
  try {
    const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : ""; const password = typeof body?.password === "string" ? body.password : "";
    const passwordError = validatePassword(password); if (!token || passwordError) return NextResponse.json({ error: passwordError ?? "重置链接无效" }, { status: 400 });
    const reset = await db.prepare(`SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1`).bind(await hashText(token)).first<{ id: string; user_id: string }>();
    if (!reset) return NextResponse.json({ error: "重置链接无效或已经过期" }, { status: 400 });
    const data = await createPasswordHash(password);
    await db.batch([
      db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0,
        failed_login_count = 0, locked_until = NULL, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(data.hash, data.salt, data.iterations, reset.user_id),
      db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reset.id),
      db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(reset.user_id),
    ]);
    await writeSecurityEvent(db, request, "password.reset", true, "", reset.user_id); return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "密码重置失败") }, { status: 500 }); }
}

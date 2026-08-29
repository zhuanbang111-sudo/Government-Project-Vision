import { NextRequest, NextResponse } from "next/server";
import { createPasswordHash, hashText, SESSION_COOKIE, validatePassword, verifyPassword } from "../../_auth";
import { identityError, resolveIdentity, writeActivity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : ""; const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const passwordError = validatePassword(newPassword); if (!currentPassword || passwordError) return NextResponse.json({ error: passwordError ?? "请输入当前密码" }, { status: 400 });
    const db = await getDatabase(); const identity = await resolveIdentity(request, db);
    const user = await db.prepare("SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?").bind(identity.userId).first<{ password_hash: string | null; password_salt: string | null; password_iterations: number }>();
    if (!user?.password_hash || !user.password_salt || !await verifyPassword(currentPassword, user.password_hash, user.password_salt, user.password_iterations)) return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    const data = await createPasswordHash(newPassword);
    const currentToken = request.cookies.get(SESSION_COOKIE)?.value;
    const currentTokenHash = currentToken ? await hashText(currentToken) : "";
    await db.batch([
      db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0,
        password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(data.hash, data.salt, data.iterations, identity.userId),
      db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL").bind(identity.userId, currentTokenHash),
    ]);
    await writeActivity(db, identity, "user.password_changed", "user", identity.userId); return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "密码修改失败") }, { status: identityError(error) ? 401 : 500 }); }
}

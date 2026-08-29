import { NextRequest, NextResponse } from "next/server";
import { generateResetToken, hashText, type SystemRole } from "../../../../_auth";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../../../_identity";
import { getDatabase } from "../../../../_platform";
import { errorMessage } from "../../../../_shared";

export async function POST(request: NextRequest, context: RouteContext<"/api/admin/users/[id]/reset-password">) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity); const userId = (await context.params).id;
    const target = await db.prepare("SELECT system_role FROM users WHERE id = ?").bind(userId).first<{ system_role: SystemRole }>();
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if ((target.system_role === "super_admin" || target.system_role === "admin") && identity.systemRole !== "super_admin") return NextResponse.json({ error: "只有超级管理员可以重置管理员密码" }, { status: 403 });
    const token = generateResetToken(); const id = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").bind(userId),
      db.prepare(`INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_by) VALUES (?, ?, ?, datetime('now', '+30 minutes'), ?)`).bind(id, userId, await hashText(token), identity.userId),
      db.prepare("UPDATE users SET must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId),
    ]);
    await writeActivity(db, identity, "user.password_reset_issued", "user", userId); return NextResponse.json({ token, expiresInMinutes: 30 });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


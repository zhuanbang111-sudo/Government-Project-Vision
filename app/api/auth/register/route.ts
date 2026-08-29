import { NextRequest, NextResponse } from "next/server";
import { createPasswordHash, createSession, enforceSameOrigin, hashText, normalizeEmail, normalizeUsername, validatePassword, validateTurnstile, writeSecurityEvent, type SystemRole } from "../../_auth";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

type Payload = { inviteCode?: unknown; username?: unknown; email?: unknown; displayName?: unknown; password?: unknown; turnstileToken?: unknown };

export async function POST(request: NextRequest) {
  enforceSameOrigin(request);
  const db = await getDatabase();
  let identifier = "";
  try {
    const body = await request.json().catch(() => null) as Payload | null;
    const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
    const username = normalizeUsername(body?.username);
    const email = normalizeEmail(body?.email);
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 60) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    identifier = email ?? username ?? "unknown";
    if (!inviteCode || !username || !email || displayName.length < 2) return NextResponse.json({ error: "请完整填写有效的邀请码、用户名、姓名和邮箱" }, { status: 400 });
    const passwordError = validatePassword(password); if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    await validateTurnstile(body?.turnstileToken, request);
    const inviteHash = await hashText(inviteCode);
    const invitation = await db.prepare(`SELECT id, role, department_id FROM invitations
      WHERE code_hash = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP
      AND used_count < max_uses LIMIT 1`).bind(inviteHash).first<{ id: string; role: SystemRole; department_id: string | null }>();
    if (!invitation) return NextResponse.json({ error: "邀请码无效、已过期或使用次数已满" }, { status: 400 });
    const passwordData = await createPasswordHash(password); const userId = crypto.randomUUID();
    const workspaceRole = invitation.role === "reviewer" ? "reviewer" : "editor";
    await db.batch([
      db.prepare(`INSERT INTO users (id, email, username, display_name, role, system_role, department_id, auth_source,
        password_hash, password_salt, password_iterations, password_changed_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'password', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM invitations WHERE id = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP
          AND expires_at > CURRENT_TIMESTAMP AND used_count < max_uses)`).bind(
        userId, email, username, displayName, workspaceRole, invitation.role, invitation.department_id,
        passwordData.hash, passwordData.salt, passwordData.iterations, invitation.id,
      ),
      db.prepare("UPDATE invitations SET used_count = used_count + 1 WHERE id = ? AND status = 'active' AND used_count < max_uses AND expires_at > CURRENT_TIMESTAMP").bind(invitation.id),
      db.prepare("INSERT INTO invitation_redemptions (invitation_id, user_id) VALUES (?, ?)").bind(invitation.id, userId),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('default-workspace', ?, ?)").bind(userId, workspaceRole),
    ]);
    const response = NextResponse.json({ success: true, displayName, systemRole: invitation.role }, { status: 201 });
    await createSession(db, request, response, userId);
    await writeSecurityEvent(db, request, "register", true, identifier, userId, { invitationId: invitation.id });
    return response;
  } catch (error: unknown) {
    await writeSecurityEvent(db, request, "register", false, identifier).catch(() => undefined);
    const message = errorMessage(error, "注册失败");
    const duplicate = /unique|constraint/i.test(message);
    console.error(JSON.stringify({ message: "registration failed", error: message }));
    return NextResponse.json({ error: duplicate ? "用户名或邮箱已被注册" : message }, { status: duplicate ? 409 : 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, createPasswordHash, createSession, enforceSameOrigin, hashText, normalizeEmail, validatePassword, writeSecurityEvent } from "../../_auth";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function POST(request: NextRequest) {
  enforceSameOrigin(request);
  const db = await getDatabase();
  try {
    const body = await request.json().catch(() => null) as { bootstrapToken?: unknown; email?: unknown; displayName?: unknown; password?: unknown } | null;
    const configured = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();
    if (!configured) return NextResponse.json({ error: "管理员初始化未启用" }, { status: 503 });
    const provided = typeof body?.bootstrapToken === "string" ? body.bootstrapToken.trim() : "";
    if (!provided || !constantTimeEqual(await hashText(provided), await hashText(configured))) return NextResponse.json({ error: "初始化凭证无效" }, { status: 403 });
    const email = normalizeEmail(body?.email); const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 60) : ""; const password = typeof body?.password === "string" ? body.password : "";
    const passwordError = validatePassword(password); if (!email || displayName.length < 2 || passwordError) return NextResponse.json({ error: passwordError ?? "请填写有效邮箱和管理员姓名" }, { status: 400 });
    const existing = await db.prepare("SELECT password_hash FROM users WHERE id = 'system-owner'").first<{ password_hash: string | null }>();
    if (existing?.password_hash) return NextResponse.json({ error: "超级管理员已经完成初始化" }, { status: 409 });
    const passwordData = await createPasswordHash(password);
    await db.prepare(`UPDATE users SET username = 'admin', email = ?, display_name = ?, password_hash = ?, password_salt = ?,
      password_iterations = ?, system_role = 'super_admin', auth_source = 'password', department_id = 'default-department',
      must_change_password = 1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 'system-owner'`).bind(email, displayName, passwordData.hash, passwordData.salt, passwordData.iterations).run();
    const response = NextResponse.json({ success: true }); await createSession(db, request, response, "system-owner");
    await writeSecurityEvent(db, request, "admin.bootstrap", true, email, "system-owner"); return response;
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "管理员初始化失败") }, { status: 500 }); }
}

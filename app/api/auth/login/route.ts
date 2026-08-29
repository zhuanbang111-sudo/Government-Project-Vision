import { NextRequest, NextResponse } from "next/server";
import { createSession, enforceLoginRateLimit, enforceSameOrigin, validateTurnstile, verifyPassword, writeSecurityEvent } from "../../_auth";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

type LoginUser = { id: string; password_hash: string | null; password_salt: string | null; password_iterations: number; status: string; locked_until: string | null; failed_login_count: number };

export async function POST(request: NextRequest) {
  enforceSameOrigin(request);
  const db = await getDatabase();
  let account = "";
  try {
    const body = await request.json().catch(() => null) as { account?: unknown; password?: unknown; turnstileToken?: unknown } | null;
    account = typeof body?.account === "string" ? body.account.trim().toLowerCase().slice(0, 160) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!account || !password) return NextResponse.json({ error: "请输入用户名或邮箱及密码" }, { status: 400 });
    await enforceLoginRateLimit(db, request, account); await validateTurnstile(body?.turnstileToken, request);
    const user = await db.prepare(`SELECT id, password_hash, password_salt, password_iterations, status, locked_until, failed_login_count
      FROM users WHERE lower(username) = ? OR lower(email) = ? LIMIT 1`).bind(account, account).first<LoginUser>();
    const locked = user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
    const valid = Boolean(user && user.status === "active" && !locked && user.password_hash && user.password_salt
      && await verifyPassword(password, user.password_hash, user.password_salt, user.password_iterations));
    if (!valid || !user) {
      if (user && !locked) await db.prepare(`UPDATE users SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count >= 4 THEN datetime('now', '+15 minutes') ELSE locked_until END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(user.id).run();
      await writeSecurityEvent(db, request, "login", false, account, user?.id ?? null, { reason: locked ? "locked" : "invalid_credentials" });
      return NextResponse.json({ error: locked ? "账号暂时锁定，请稍后重试" : "用户名、邮箱或密码错误" }, { status: 401 });
    }
    await db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    const response = NextResponse.json({ success: true }); await createSession(db, request, response, user.id);
    await writeSecurityEvent(db, request, "login", true, account, user.id); return response;
  } catch (error: unknown) {
    const message = errorMessage(error, "登录失败");
    return NextResponse.json({ error: message }, { status: /频繁/.test(message) ? 429 : 500 });
  }
}

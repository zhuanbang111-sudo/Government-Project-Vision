import { NextRequest, NextResponse } from "next/server";
import { generateInviteCode, hashText, type SystemRole } from "../../_auth";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const { results } = await db.prepare(`SELECT i.id, i.code_hint, i.role, i.department_id, d.name AS department_name,
      i.max_uses, i.used_count, i.starts_at, i.expires_at, i.status, i.remark, i.public_display,
      i.public_code, i.public_label, i.created_at, u.display_name AS creator_name
      FROM invitations i LEFT JOIN departments d ON d.id = i.department_id JOIN users u ON u.id = i.created_by
      ORDER BY i.created_at DESC LIMIT 200`).all();
    return NextResponse.json(results, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const body = await request.json().catch(() => null) as { role?: unknown; departmentId?: unknown; maxUses?: unknown; expiresInDays?: unknown; remark?: unknown; publicDisplay?: unknown; publicLabel?: unknown } | null;
    const publicDisplay = body?.publicDisplay === true || body?.publicDisplay === "on";
    const role: SystemRole = publicDisplay ? "user" : body?.role === "admin" ? "admin" : body?.role === "reviewer" ? "reviewer" : "user";
    if (role === "admin" && identity.systemRole !== "super_admin") return NextResponse.json({ error: "只有超级管理员可以创建管理员邀请码" }, { status: 403 });
    const departmentId = typeof body?.departmentId === "string" && body.departmentId ? body.departmentId : null;
    const maxUses = Math.min(100, Math.max(1, Number(body?.maxUses) || 1)); const expiresInDays = Math.min(90, Math.max(1, Number(body?.expiresInDays) || 7));
    if (departmentId && !await db.prepare("SELECT id FROM departments WHERE id = ? AND status = 'active'").bind(departmentId).first()) return NextResponse.json({ error: "所选部门不存在或已停用" }, { status: 400 });
    const code = generateInviteCode(); const id = crypto.randomUUID();
    const publicLabel = publicDisplay && typeof body?.publicLabel === "string" ? body.publicLabel.trim().slice(0, 60) : "";
    const insert = db.prepare(`INSERT INTO invitations
      (id, code_hash, code_hint, role, department_id, max_uses, expires_at, remark, created_by, public_display, public_code, public_label)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, ?, ?, ?)`).bind(
        id, await hashText(code), `${code.slice(0, 9)}…${code.slice(-5)}`, role, departmentId, maxUses,
        `+${expiresInDays} days`, typeof body?.remark === "string" ? body.remark.trim().slice(0, 200) : "",
        identity.userId, publicDisplay ? 1 : 0, publicDisplay ? code : null, publicLabel || (publicDisplay ? "内部试用邀请码" : ""),
      );
    await db.batch(publicDisplay ? [
      db.prepare("UPDATE invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE public_display = 1 AND status = 'active'"),
      insert,
    ] : [insert]);
    await writeActivity(db, identity, "invitation.created", "invitation", id, { role, departmentId, maxUses, expiresInDays, publicDisplay });
    return NextResponse.json({ id, code, role, maxUses, expiresInDays, publicDisplay }, { status: 201 });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "邀请码创建失败") }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}

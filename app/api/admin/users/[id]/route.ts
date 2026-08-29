import { NextRequest, NextResponse } from "next/server";
import { type SystemRole } from "../../../_auth";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../../_identity";
import { getDatabase } from "../../../_platform";
import { errorMessage } from "../../../_shared";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/users/[id]">) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const id = (await context.params).id; const target = await db.prepare("SELECT system_role, department_id, status FROM users WHERE id = ?").bind(id).first<{ system_role: SystemRole; department_id: string | null; status: string }>();
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if ((target.system_role === "super_admin" || target.system_role === "admin") && identity.systemRole !== "super_admin") return NextResponse.json({ error: "只有超级管理员可以管理管理员账号" }, { status: 403 });
    const body = await request.json().catch(() => null) as { displayName?: unknown; role?: unknown; departmentId?: unknown; status?: unknown } | null;
    const role: SystemRole = body?.role === "admin" ? "admin" : body?.role === "reviewer" ? "reviewer" : body?.role === "user" ? "user" : target.system_role;
    if ((role === "admin" || role === "super_admin") && identity.systemRole !== "super_admin") return NextResponse.json({ error: "只有超级管理员可以授予管理员权限" }, { status: 403 });
    if (id === identity.userId && body?.status === "disabled") return NextResponse.json({ error: "不能停用当前登录账号" }, { status: 400 });
    const status = body?.status === "disabled" ? "disabled" : body?.status === "active" ? "active" : target.status;
    const departmentId = typeof body?.departmentId === "string" ? body.departmentId || null : target.department_id;
    if (departmentId && !await db.prepare("SELECT id FROM departments WHERE id = ? AND status = 'active'").bind(departmentId).first()) return NextResponse.json({ error: "所选部门不存在或已停用" }, { status: 400 });
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 60) : null;
    await db.batch([
      db.prepare(`UPDATE users SET display_name = COALESCE(?, display_name), system_role = ?, department_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(displayName, role, departmentId, status, id),
      db.prepare(`UPDATE workspace_members SET role = ? WHERE workspace_id = 'default-workspace' AND user_id = ?`).bind(role === "reviewer" ? "reviewer" : role === "admin" || role === "super_admin" ? "owner" : "editor", id),
      ...(status === "disabled" ? [db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(id)] : []),
    ]);
    await writeActivity(db, identity, "user.updated", "user", id, { role, departmentId, status }); return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../../_identity";
import { getDatabase } from "../../../_platform";
import { errorMessage } from "../../../_shared";
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/departments/[id]">) {
  try { const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity); const id = (await context.params).id; const body = await request.json().catch(() => null) as { name?: unknown; status?: unknown } | null; const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : null; const status = body?.status === "disabled" ? "disabled" : "active"; if (id === "default-department" && status === "disabled") return NextResponse.json({ error: "默认部门不能停用" }, { status: 400 }); const result = await db.prepare("UPDATE departments SET name = COALESCE(?, name), status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, status, id).run(); if (!result.meta.changes) return NextResponse.json({ error: "部门不存在" }, { status: 404 }); await writeActivity(db, identity, "department.updated", "department", id, { name, status }); return NextResponse.json({ success: true }); }
  catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


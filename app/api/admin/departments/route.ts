import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function GET(request: NextRequest) {
  try { const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity); const { results } = await db.prepare(`SELECT d.id, d.name, d.code, d.status, d.created_at, COUNT(u.id) AS user_count FROM departments d LEFT JOIN users u ON u.department_id = d.id GROUP BY d.id ORDER BY d.status, d.name`).all(); return NextResponse.json(results); }
  catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}
export async function POST(request: NextRequest) {
  try { const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity); const body = await request.json().catch(() => null) as { name?: unknown; code?: unknown } | null; const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : ""; const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().slice(0, 30) : ""; if (name.length < 2 || !/^[A-Z0-9_-]{2,30}$/.test(code)) return NextResponse.json({ error: "请输入有效的部门名称和英文编码" }, { status: 400 }); const id = crypto.randomUUID(); await db.prepare("INSERT INTO departments (id, name, code, created_by) VALUES (?, ?, ?, ?)").bind(id, name, code, identity.userId).run(); await writeActivity(db, identity, "department.created", "department", id, { name, code }); return NextResponse.json({ id, name, code }, { status: 201 }); }
  catch (error: unknown) { const message = errorMessage(error); return NextResponse.json({ error: /unique/i.test(message) ? "部门名称或编码已存在" : message }, { status: /unique/i.test(message) ? 409 : identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


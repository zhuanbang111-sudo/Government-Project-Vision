import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../_identity";
import { errorMessage } from "../../../_shared";

const memberRoles = ["viewer", "editor", "reviewer"] as const;

export async function GET(request: NextRequest, context: RouteContext<"/api/projects/[id]/members">) {
  try {
    const projectId = (await context.params).id;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, projectId, "viewer");
    const [members, available] = await Promise.all([
      db.prepare(`SELECT pm.user_id, pm.role, pm.created_at, u.email, u.display_name
        FROM project_members pm JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ? ORDER BY pm.created_at`).bind(projectId).all(),
      db.prepare(`SELECT u.id, u.email, u.display_name, wm.role
        FROM workspace_members wm JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ? AND u.status = 'active' ORDER BY u.display_name`).bind(identity.workspaceId).all(),
    ]);
    return NextResponse.json({ members: members.results, availableUsers: available.results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/members">) {
  try {
    const projectId = (await context.params).id;
    const body = await request.json().catch(() => null) as { userId?: unknown; role?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const role = typeof body?.role === "string" && memberRoles.includes(body.role as typeof memberRoles[number]) ? body.role : null;
    if (!userId || !role) return NextResponse.json({ error: "请选择成员和项目角色" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await requireProjectAccess(db, identity, projectId, "owner");
    if (userId === project.owner_user_id) return NextResponse.json({ error: "项目负责人无需重复添加" }, { status: 400 });
    const available = await db.prepare(`SELECT u.id FROM workspace_members wm JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ? AND u.id = ? AND u.status = 'active'`).bind(identity.workspaceId, userId).first();
    if (!available) return NextResponse.json({ error: "该用户不在当前工作区" }, { status: 404 });
    await db.prepare(`INSERT INTO project_members (project_id, user_id, role, added_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, added_by = excluded.added_by`)
      .bind(projectId, userId, role, identity.userId).run();
    await writeActivity(db, identity, "project.member_updated", "writing_project", projectId, { userId, role });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/projects/[id]/members">) {
  try {
    const projectId = (await context.params).id;
    const userId = request.nextUrl.searchParams.get("userId") || "";
    if (!userId) return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, projectId, "owner");
    const result = await db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").bind(projectId, userId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "项目成员不存在" }, { status: 404 });
    await writeActivity(db, identity, "project.member_removed", "writing_project", projectId, { userId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}


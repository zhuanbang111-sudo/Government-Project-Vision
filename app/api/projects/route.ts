import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { identityError, resolveIdentity, writeActivity } from "../_identity";
import { errorMessage } from "../_shared";

type CreateProjectPayload = {
  title?: unknown;
  documentType?: unknown;
  task?: unknown;
  outline?: unknown;
  visibility?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const requestedView = request.nextUrl.searchParams.get("view");
    const view = requestedView === "completed" || requestedView === "archived" || requestedView === "all" ? requestedView : "active";
    const viewCondition = view === "completed"
      ? "p.archived_at IS NULL AND p.status = 'completed'"
      : view === "archived"
        ? "p.archived_at IS NOT NULL"
        : view === "all"
          ? "1 = 1"
          : "p.archived_at IS NULL AND p.status <> 'completed'";
    const isAdmin = identity.systemRole === "admin" || identity.systemRole === "super_admin";
    const visibility = isAdmin ? "1 = 1" : `(p.owner_user_id = ? OR p.visibility = 'workspace' OR (p.visibility = 'department' AND p.department_id = ?) OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))`;
    const bindings = isAdmin ? [identity.workspaceId] : [identity.workspaceId, identity.userId, identity.departmentId ?? "", identity.userId];
    const [projectResult, countResult] = await Promise.all([
      db.prepare(`SELECT p.id, p.title, p.document_type, p.status, p.owner_user_id,
        p.created_at, p.updated_at, p.archived_at, u.display_name AS owner_name,
        (SELECT COUNT(*) FROM project_documents pd JOIN documents d ON d.id = pd.document_id
          WHERE pd.project_id = p.id AND d.owner_user_id = ?) AS document_count,
        (SELECT COUNT(*) FROM draft_versions dv WHERE dv.project_id = p.id) AS version_count,
        (SELECT COUNT(*) FROM project_exports pe WHERE pe.project_id = p.id) AS export_count,
        (SELECT id FROM project_exports pe WHERE pe.project_id = p.id ORDER BY created_at DESC LIMIT 1) AS latest_export_id,
        (SELECT stage FROM draft_versions dv WHERE dv.project_id = p.id ORDER BY version_number DESC LIMIT 1) AS latest_stage
      FROM writing_projects p JOIN users u ON u.id = p.owner_user_id
      WHERE p.workspace_id = ? AND ${visibility} AND (${viewCondition})
      ORDER BY COALESCE(p.archived_at, p.updated_at) DESC LIMIT 200`).bind(identity.userId, ...bindings).all(),
      db.prepare(`SELECT
          SUM(CASE WHEN p.archived_at IS NULL AND p.status <> 'completed' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN p.archived_at IS NULL AND p.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN p.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
        FROM writing_projects p WHERE p.workspace_id = ? AND ${visibility}`).bind(...bindings).first<{ active: number | null; completed: number | null; archived: number | null }>(),
    ]);
    return NextResponse.json({ projects: projectResult.results, counts: { active: countResult?.active ?? 0, completed: countResult?.completed ?? 0, archived: countResult?.archived ?? 0 }, view, identity }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as CreateProjectPayload | null;
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const documentType = typeof body?.documentType === "string" ? body.documentType.trim().slice(0, 50) : "工作报告";
    if (!title) return NextResponse.json({ error: "项目标题不能为空" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const id = crypto.randomUUID();
    const outline = Array.isArray(body?.outline) ? body.outline.filter((item): item is string => typeof item === "string").slice(0, 30) : [];
    const visibility = body?.visibility === "workspace" || body?.visibility === "personal" ? body.visibility : "department";
    await db.prepare(`INSERT INTO writing_projects
      (id, workspace_id, owner_user_id, title, document_type, status, task_json, outline_json, visibility, department_id)
      VALUES (?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)`).bind(
        id, identity.workspaceId, identity.userId, title, documentType,
        JSON.stringify(body?.task && typeof body.task === "object" ? body.task : {}), JSON.stringify(outline), visibility, identity.departmentId,
      ).run();
    await writeActivity(db, identity, "project.created", "writing_project", id, { title, documentType });
    return NextResponse.json({ id, title, status: "planning" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

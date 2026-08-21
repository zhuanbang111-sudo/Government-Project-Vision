import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { identityError, resolveIdentity, writeActivity } from "../_identity";
import { errorMessage } from "../_shared";

type CreateProjectPayload = {
  title?: unknown;
  documentType?: unknown;
  task?: unknown;
  outline?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const includeArchived = request.nextUrl.searchParams.get("archived") === "true";
    const visibility = identity.role === "owner" ? "1 = 1" : "(p.owner_user_id = ? OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))";
    const { results } = await db.prepare(`SELECT p.id, p.title, p.document_type, p.status, p.owner_user_id,
        p.created_at, p.updated_at, p.archived_at, u.display_name AS owner_name,
        (SELECT COUNT(*) FROM project_documents pd WHERE pd.project_id = p.id) AS document_count,
        (SELECT COUNT(*) FROM draft_versions dv WHERE dv.project_id = p.id) AS version_count,
        (SELECT stage FROM draft_versions dv WHERE dv.project_id = p.id ORDER BY version_number DESC LIMIT 1) AS latest_stage
      FROM writing_projects p JOIN users u ON u.id = p.owner_user_id
      WHERE p.workspace_id = ? AND ${visibility} AND (${includeArchived ? "1 = 1" : "p.archived_at IS NULL"})
      ORDER BY p.updated_at DESC LIMIT 200`).bind(identity.workspaceId, ...(identity.role === "owner" ? [] : [identity.userId, identity.userId])).all();
    return NextResponse.json({ projects: results, identity }, { headers: { "Cache-Control": "private, no-store" } });
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
    await db.prepare(`INSERT INTO writing_projects
      (id, workspace_id, owner_user_id, title, document_type, status, task_json, outline_json)
      VALUES (?, ?, ?, ?, ?, 'planning', ?, ?)`).bind(
        id, identity.workspaceId, identity.userId, title, documentType,
        JSON.stringify(body?.task && typeof body.task === "object" ? body.task : {}), JSON.stringify(outline),
      ).run();
    await writeActivity(db, identity, "project.created", "writing_project", id, { title, documentType });
    return NextResponse.json({ id, title, status: "planning" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

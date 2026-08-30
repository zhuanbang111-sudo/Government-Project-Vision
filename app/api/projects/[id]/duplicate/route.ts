import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../_identity";
import { errorMessage } from "../../../_shared";

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/duplicate">) {
  try {
    const sourceProjectId = (await context.params).id;
    const body = await request.json().catch(() => null) as { title?: unknown } | null;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, sourceProjectId, "viewer");
    const source = await db.prepare(`SELECT title, document_type, task_json, outline_json
      FROM writing_projects WHERE id = ? AND workspace_id = ?`).bind(sourceProjectId, identity.workspaceId)
      .first<{ title: string; document_type: string; task_json: string; outline_json: string }>();
    if (!source) return NextResponse.json({ error: "源项目不存在或无权访问" }, { status: 404 });
    const projectId = crypto.randomUUID();
    const requestedTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const title = requestedTitle || `${source.title}（续写）`.slice(0, 200);
    await db.batch([
      db.prepare(`INSERT INTO writing_projects
        (id, workspace_id, owner_user_id, title, document_type, status, task_json, outline_json)
        VALUES (?, ?, ?, ?, ?, 'planning', ?, ?)`).bind(
          projectId, identity.workspaceId, identity.userId, title, source.document_type, source.task_json, source.outline_json,
        ),
      db.prepare(`INSERT INTO project_documents
        (project_id, document_id, usage_tags, selected_passages, created_by)
        SELECT ?, pd.document_id, pd.usage_tags, pd.selected_passages, ?
        FROM project_documents pd JOIN documents d ON d.id = pd.document_id
        WHERE pd.project_id = ? AND d.owner_user_id = ? AND d.deleted_at IS NULL`)
        .bind(projectId, identity.userId, sourceProjectId, identity.userId),
    ]);
    await writeActivity(db, identity, "project.created_from_archive", "writing_project", projectId, { sourceProjectId });
    await writeActivity(db, identity, "project.used_as_template", "writing_project", sourceProjectId, { newProjectId: projectId });
    return NextResponse.json({ id: projectId, title, status: "planning", sourceProjectId }, { status: 201 });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

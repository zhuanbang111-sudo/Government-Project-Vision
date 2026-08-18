import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../_platform";
import { identityError, resolveIdentity, writeActivity } from "../../_identity";
import { errorMessage } from "../../_shared";

const statuses = ["planning", "materials", "drafting", "review", "completed", "archived"] as const;

export async function GET(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await db.prepare(`SELECT p.*, u.display_name AS owner_name
      FROM writing_projects p JOIN users u ON u.id = p.owner_user_id
      WHERE p.id = ? AND p.workspace_id = ?`).bind(id, identity.workspaceId).first();
    if (!project) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
    const [versions, documents, exports, activities] = await Promise.all([
      db.prepare(`SELECT id, version_number, stage, content, source_snapshot, audit_json, created_by, created_at
        FROM draft_versions WHERE project_id = ? ORDER BY version_number DESC`).bind(id).all(),
      db.prepare(`SELECT d.id, d.filename, d.document_type, d.department, d.verification_status,
          pd.usage_tags, pd.selected_passages, pd.created_at
        FROM project_documents pd JOIN documents d ON d.id = pd.document_id
        WHERE pd.project_id = ? AND d.deleted_at IS NULL ORDER BY pd.created_at DESC`).bind(id).all(),
      db.prepare(`SELECT id, draft_version_id, filename, object_key, content_hash, file_size, created_at
        FROM project_exports WHERE project_id = ? ORDER BY created_at DESC`).bind(id).all(),
      db.prepare(`SELECT a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.display_name AS actor_name
        FROM activity_logs a JOIN users u ON u.id = a.actor_user_id
        WHERE a.workspace_id = ? AND a.entity_type = 'writing_project' AND a.entity_id = ?
        ORDER BY a.created_at DESC LIMIT 50`).bind(identity.workspaceId, id).all(),
    ]);
    return NextResponse.json({ project, versions: versions.results, documents: documents.results, exports: exports.results, activities: activities.results });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const body = await request.json().catch(() => null) as { title?: unknown; documentType?: unknown; status?: unknown; task?: unknown; outline?: unknown } | null;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const current = await db.prepare("SELECT id, title, document_type, status FROM writing_projects WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
      .bind(id, identity.workspaceId).first<{ id: string; title: string; document_type: string; status: string }>();
    if (!current) return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 });
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : current.title;
    const documentType = typeof body?.documentType === "string" && body.documentType.trim() ? body.documentType.trim().slice(0, 50) : current.document_type;
    const status = typeof body?.status === "string" && statuses.includes(body.status as typeof statuses[number]) ? body.status : current.status;
    const taskJson = body?.task && typeof body.task === "object" ? JSON.stringify(body.task) : null;
    const outlineJson = Array.isArray(body?.outline) ? JSON.stringify(body.outline.filter((item): item is string => typeof item === "string").slice(0, 30)) : null;
    await db.prepare(`UPDATE writing_projects SET title = ?, document_type = ?, status = ?,
      task_json = COALESCE(?, task_json), outline_json = COALESCE(?, outline_json), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND workspace_id = ?`).bind(title, documentType, status, taskJson, outlineJson, id, identity.workspaceId).run();
    await writeActivity(db, identity, "project.updated", "writing_project", id, { title, documentType, status });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const result = await db.prepare(`UPDATE writing_projects SET status = 'archived', archived_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`).bind(id, identity.workspaceId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 });
    await writeActivity(db, identity, "project.archived", "writing_project", id);
    return NextResponse.json({ success: true, recoverable: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getDatabase, placeholders } from "../../../_platform";
import { identityError, resolveIdentity, writeActivity } from "../../../_identity";
import { errorMessage } from "../../../_shared";

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/documents">) {
  try {
    const projectId = (await context.params).id;
    const body = await request.json().catch(() => null) as { documents?: unknown } | null;
    const entries = Array.isArray(body?.documents) ? body.documents.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as { documentId?: unknown; usageTags?: unknown; selectedPassages?: unknown };
      if (!Number.isInteger(value.documentId) || Number(value.documentId) <= 0) return [];
      return [{ documentId: Number(value.documentId), usageTags: Array.isArray(value.usageTags) ? value.usageTags : [], selectedPassages: Array.isArray(value.selectedPassages) ? value.selectedPassages : [] }];
    }).slice(0, 100) : [];
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await db.prepare("SELECT id FROM writing_projects WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
      .bind(projectId, identity.workspaceId).first();
    if (!project) return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 });
    const ids = [...new Set(entries.map((item) => item.documentId))];
    if (ids.length) {
      const available = await db.prepare(`SELECT id FROM documents WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (${placeholders(ids)})`)
        .bind(identity.workspaceId, ...ids).all<{ id: number }>();
      if (available.results.length !== ids.length) return NextResponse.json({ error: "部分资料不存在或无权访问" }, { status: 403 });
    }
    const statements = [db.prepare("DELETE FROM project_documents WHERE project_id = ?").bind(projectId), ...entries.map((item) => db.prepare(`INSERT INTO project_documents
      (project_id, document_id, usage_tags, selected_passages, created_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(projectId, item.documentId, JSON.stringify(item.usageTags), JSON.stringify(item.selectedPassages), identity.userId))];
    await db.batch(statements);
    await db.prepare("UPDATE writing_projects SET status = 'materials', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId).run();
    await writeActivity(db, identity, "project.materials_updated", "writing_project", projectId, { documentCount: ids.length, passageCount: entries.reduce((sum, item) => sum + item.selectedPassages.length, 0) });
    return NextResponse.json({ success: true, documentCount: ids.length });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 });
  }
}


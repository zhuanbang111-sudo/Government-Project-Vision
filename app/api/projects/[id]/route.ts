import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../_identity";
import { errorMessage } from "../../_shared";

const statuses = ["planning", "materials", "drafting", "review", "completed", "archived"] as const;

function compareParagraphs(previous: string, current: string) {
  const before = previous.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 300);
  const after = current.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 300);
  const matrix = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left -= 1) for (let right = after.length - 1; right >= 0; right -= 1) {
    matrix[left][right] = before[left] === after[right] ? matrix[left + 1][right + 1] + 1 : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
  }
  const changes: Array<{ type: "unchanged" | "added" | "removed"; text: string }> = [];
  let left = 0; let right = 0;
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) { changes.push({ type: "unchanged", text: before[left] }); left += 1; right += 1; }
    else if (matrix[left + 1][right] >= matrix[left][right + 1]) { changes.push({ type: "removed", text: before[left] }); left += 1; }
    else { changes.push({ type: "added", text: after[right] }); right += 1; }
  }
  while (left < before.length) { changes.push({ type: "removed", text: before[left] }); left += 1; }
  while (right < after.length) { changes.push({ type: "added", text: after[right] }); right += 1; }
  return { changes, added: changes.filter((item) => item.type === "added").length, removed: changes.filter((item) => item.type === "removed").length };
}

export async function GET(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const access = await requireProjectAccess(db, identity, id, "viewer");
    const project = await db.prepare(`SELECT p.*, u.display_name AS owner_name
      FROM writing_projects p JOIN users u ON u.id = p.owner_user_id
      WHERE p.id = ? AND p.workspace_id = ?`).bind(id, identity.workspaceId).first();
    if (!project) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
    const [versions, documents, exports, activities, members, reviews, comments, citationChecks] = await Promise.all([
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
      db.prepare(`SELECT pm.user_id, pm.role, pm.created_at, u.email, u.display_name
        FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY pm.created_at`).bind(id).all(),
      db.prepare(`SELECT r.*, requester.display_name AS requester_name, assignee.display_name AS assignee_name, decider.display_name AS decider_name
        FROM review_requests r JOIN users requester ON requester.id = r.requested_by
        LEFT JOIN users assignee ON assignee.id = r.assigned_to LEFT JOIN users decider ON decider.id = r.decided_by
        WHERE r.project_id = ? ORDER BY r.submitted_at DESC`).bind(id).all(),
      db.prepare(`SELECT c.*, author.display_name AS author_name, resolver.display_name AS resolver_name
        FROM review_comments c JOIN users author ON author.id = c.author_user_id
        LEFT JOIN users resolver ON resolver.id = c.resolved_by WHERE c.project_id = ? ORDER BY c.created_at`).bind(id).all(),
      db.prepare(`SELECT id, review_request_id, version_id, marker, status, source_kind, source_title, details, checked_at
        FROM citation_checks WHERE project_id = ? ORDER BY id`).bind(id).all(),
    ]);
    const latestVersions = versions.results as Array<{ id: number; content: string }>;
    const comparisonTarget = latestVersions[0];
    const comparisonBase = comparisonTarget
      ? latestVersions.slice(1).find((version) => version.content !== comparisonTarget.content) ?? latestVersions[1]
      : undefined;
    const versionComparison = comparisonTarget && comparisonBase ? {
      fromVersionId: comparisonBase.id,
      toVersionId: comparisonTarget.id,
      ...compareParagraphs(comparisonBase.content, comparisonTarget.content),
    } : null;
    return NextResponse.json({ project, permission: access.permission, versions: versions.results, documents: documents.results, exports: exports.results, activities: activities.results, members: members.results, reviews: reviews.results, comments: comments.results, citationChecks: citationChecks.results, versionComparison }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const body = await request.json().catch(() => null) as { title?: unknown; documentType?: unknown; status?: unknown; task?: unknown; outline?: unknown } | null;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, id, "editor");
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
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/projects/[id]">) {
  try {
    const id = (await context.params).id;
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, id, "owner");
    const result = await db.prepare(`UPDATE writing_projects SET status = 'archived', archived_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`).bind(id, identity.workspaceId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 });
    await writeActivity(db, identity, "project.archived", "writing_project", id);
    return NextResponse.json({ success: true, recoverable: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

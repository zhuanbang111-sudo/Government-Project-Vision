import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../_identity";
import { errorMessage } from "../../../_shared";

const stages = ["ai_draft", "edited", "reviewed", "final"] as const;

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/versions">) {
  try {
    const projectId = (await context.params).id;
    const body = await request.json().catch(() => null) as { stage?: unknown; content?: unknown; sources?: unknown; audit?: unknown } | null;
    const stage = typeof body?.stage === "string" && stages.includes(body.stage as typeof stages[number]) ? body.stage : null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!stage || !content) return NextResponse.json({ error: "版本阶段和正文不能为空" }, { status: 400 });
    if (content.length > 150_000) return NextResponse.json({ error: "正文超过版本保存上限" }, { status: 413 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    await requireProjectAccess(db, identity, projectId, "editor");
    const project = await db.prepare("SELECT id FROM writing_projects WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
      .bind(projectId, identity.workspaceId).first();
    if (!project) return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 });
    const created = await db.prepare(`INSERT INTO draft_versions
      (project_id, version_number, stage, content, source_snapshot, audit_json, created_by)
      SELECT ?, COALESCE(MAX(version_number), 0) + 1, ?, ?, ?, ?, ? FROM draft_versions WHERE project_id = ?`)
      .bind(projectId, stage, content, JSON.stringify(body?.sources ?? []), JSON.stringify(body?.audit ?? {}), identity.userId, projectId).run();
    const versionId = Number(created.meta.last_row_id);
    const status = stage === "final" ? "completed" : stage === "reviewed" ? "review" : "drafting";
    await db.prepare("UPDATE writing_projects SET current_version_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(versionId, status, projectId).run();
    await writeActivity(db, identity, `draft.${stage}`, "writing_project", projectId, { versionId });
    return NextResponse.json({ id: versionId, stage, status }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

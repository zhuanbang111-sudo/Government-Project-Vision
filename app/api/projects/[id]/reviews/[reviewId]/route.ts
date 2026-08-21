import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../../_identity";
import { errorMessage } from "../../../../_shared";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/projects/[id]/reviews/[reviewId]">) {
  try {
    const { id: projectId, reviewId } = await context.params;
    const body = await request.json().catch(() => null) as { action?: unknown; note?: unknown } | null;
    const action = body?.action;
    if (action !== "approve" && action !== "request_changes" && action !== "cancel") return NextResponse.json({ error: "无效审核操作" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await requireProjectAccess(db, identity, projectId, action === "cancel" ? "editor" : "reviewer");
    if (project.archived_at) return NextResponse.json({ error: "归档项目为只读，请恢复后再处理审核" }, { status: 409 });
    const review = await db.prepare(`SELECT r.id, r.version_id, r.requested_by, r.assigned_to, r.status,
        v.content, v.source_snapshot, v.audit_json
      FROM review_requests r JOIN draft_versions v ON v.id = r.version_id
      WHERE r.id = ? AND r.project_id = ?`).bind(reviewId, projectId).first<{
      id: string; version_id: number; requested_by: string; assigned_to: string | null; status: string; content: string; source_snapshot: string; audit_json: string;
    }>();
    if (!review) return NextResponse.json({ error: "审核任务不存在" }, { status: 404 });
    if (review.status !== "pending") return NextResponse.json({ error: "该审核任务已经处理" }, { status: 409 });
    if (action === "cancel" && review.requested_by !== identity.userId && identity.role !== "owner") return NextResponse.json({ error: "只有提交人或负责人可以撤销审核" }, { status: 403 });
    if (review.assigned_to && review.assigned_to !== identity.userId && identity.role !== "owner") return NextResponse.json({ error: "该审核任务已指定给其他审核人员" }, { status: 403 });
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if (action === "approve") {
      const blocking = await db.prepare(`SELECT COUNT(*) AS count FROM review_comments
        WHERE review_request_id = ? AND status = 'open' AND severity = 'blocking'`).bind(reviewId).first<{ count: number }>();
      const invalid = await db.prepare(`SELECT COUNT(*) AS count FROM citation_checks
        WHERE review_request_id = ? AND status = 'missing'`).bind(reviewId).first<{ count: number }>();
      if ((blocking?.count ?? 0) > 0) return NextResponse.json({ error: "仍有阻断性意见未解决，不能批准" }, { status: 409 });
      if ((invalid?.count ?? 0) > 0) return NextResponse.json({ error: "存在无法追溯的引用标记，不能批准" }, { status: 409 });
      const created = await db.prepare(`INSERT INTO draft_versions
        (project_id, version_number, stage, content, source_snapshot, audit_json, created_by)
        SELECT ?, COALESCE(MAX(version_number), 0) + 1, 'final', ?, ?, ?, ? FROM draft_versions WHERE project_id = ?`)
        .bind(projectId, review.content, review.source_snapshot, review.audit_json, identity.userId, projectId).run();
      const finalVersionId = Number(created.meta.last_row_id);
      await db.batch([
        db.prepare(`UPDATE review_requests SET status = 'approved', decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(identity.userId, note, reviewId),
        db.prepare(`UPDATE writing_projects SET status = 'completed', current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(finalVersionId, projectId),
      ]);
      await writeActivity(db, identity, "review.approved", "writing_project", projectId, { reviewId, finalVersionId, note });
      return NextResponse.json({ success: true, status: "approved", finalVersionId });
    }
    const nextStatus = action === "request_changes" ? "changes_requested" : "cancelled";
    await db.batch([
      db.prepare(`UPDATE review_requests SET status = ?, decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(nextStatus, identity.userId, note, reviewId),
      db.prepare("UPDATE writing_projects SET status = 'drafting', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId),
    ]);
    await writeActivity(db, identity, action === "request_changes" ? "review.changes_requested" : "review.cancelled", "writing_project", projectId, { reviewId, note });
    return NextResponse.json({ success: true, status: nextStatus });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

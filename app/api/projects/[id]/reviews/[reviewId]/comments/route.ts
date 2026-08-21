import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../../../_identity";
import { errorMessage } from "../../../../../_shared";

const categories = ["content", "fact", "policy", "format", "wording"] as const;
const severities = ["suggestion", "important", "blocking"] as const;

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/reviews/[reviewId]/comments">) {
  try {
    const { id: projectId, reviewId } = await context.params;
    const body = await request.json().catch(() => null) as { anchorText?: unknown; paragraphIndex?: unknown; category?: unknown; severity?: unknown; comment?: unknown } | null;
    const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
    if (!comment) return NextResponse.json({ error: "审核意见不能为空" }, { status: 400 });
    const category = typeof body?.category === "string" && categories.includes(body.category as typeof categories[number]) ? body.category : "content";
    const severity = typeof body?.severity === "string" && severities.includes(body.severity as typeof severities[number]) ? body.severity : "suggestion";
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await requireProjectAccess(db, identity, projectId, "reviewer");
    if (project.archived_at) return NextResponse.json({ error: "归档项目为只读，请恢复后再添加批注" }, { status: 409 });
    const review = await db.prepare("SELECT version_id, status FROM review_requests WHERE id = ? AND project_id = ?").bind(reviewId, projectId).first<{ version_id: number; status: string }>();
    if (!review) return NextResponse.json({ error: "审核任务不存在" }, { status: 404 });
    if (review.status !== "pending") return NextResponse.json({ error: "审核已结束，不能继续添加意见" }, { status: 409 });
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO review_comments
      (id, review_request_id, project_id, version_id, author_user_id, anchor_text, paragraph_index, category, severity, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, reviewId, projectId, review.version_id, identity.userId,
        typeof body?.anchorText === "string" ? body.anchorText.trim().slice(0, 500) : "",
        Number.isInteger(body?.paragraphIndex) ? Number(body?.paragraphIndex) : null, category, severity, comment).run();
    await writeActivity(db, identity, "review.comment_added", "writing_project", projectId, { reviewId, commentId: id, category, severity });
    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/projects/[id]/reviews/[reviewId]/comments">) {
  try {
    const { id: projectId, reviewId } = await context.params;
    const body = await request.json().catch(() => null) as { commentId?: unknown; resolved?: unknown } | null;
    const commentId = typeof body?.commentId === "string" ? body.commentId : "";
    if (!commentId) return NextResponse.json({ error: "缺少审核意见 ID" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await requireProjectAccess(db, identity, projectId, "editor");
    if (project.archived_at) return NextResponse.json({ error: "归档项目为只读，请恢复后再处理批注" }, { status: 409 });
    const resolved = body?.resolved !== false;
    const result = resolved
      ? await db.prepare(`UPDATE review_comments SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
          WHERE id = ? AND review_request_id = ? AND project_id = ?`).bind(identity.userId, commentId, reviewId, projectId).run()
      : await db.prepare(`UPDATE review_comments SET status = 'open', resolved_by = NULL, resolved_at = NULL
          WHERE id = ? AND review_request_id = ? AND project_id = ?`).bind(commentId, reviewId, projectId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "审核意见不存在" }, { status: 404 });
    await writeActivity(db, identity, resolved ? "review.comment_resolved" : "review.comment_reopened", "writing_project", projectId, { reviewId, commentId });
    return NextResponse.json({ success: true, status: resolved ? "resolved" : "open" });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

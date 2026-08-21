import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../_identity";
import { errorMessage } from "../../../_shared";

type SourceSnapshot = { marker?: unknown; kind?: unknown; filename?: unknown; verified?: unknown };

function readMarkers(content: string) {
  return [...new Set(content.match(/【(?:外部)?来源\d+(?:-片段\d+)?】/g) ?? [])].slice(0, 200);
}

function parseSources(value: string): SourceSnapshot[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is SourceSnapshot => Boolean(item && typeof item === "object")) : []; }
  catch { return []; }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/projects/[id]/reviews">) {
  try {
    const projectId = (await context.params).id;
    const body = await request.json().catch(() => null) as { versionId?: unknown; assignedTo?: unknown; summary?: unknown } | null;
    const versionId = Number(body?.versionId);
    if (!Number.isInteger(versionId) || versionId <= 0) return NextResponse.json({ error: "请选择有效的送审版本" }, { status: 400 });
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const project = await requireProjectAccess(db, identity, projectId, "editor");
    if (project.archived_at) return NextResponse.json({ error: "归档项目为只读，请恢复后再送审" }, { status: 409 });
    const version = await db.prepare("SELECT id, content, source_snapshot FROM draft_versions WHERE id = ? AND project_id = ?")
      .bind(versionId, projectId).first<{ id: number; content: string; source_snapshot: string }>();
    if (!version) return NextResponse.json({ error: "送审版本不存在" }, { status: 404 });
    const pending = await db.prepare("SELECT id FROM review_requests WHERE project_id = ? AND status = 'pending'").bind(projectId).first();
    if (pending) return NextResponse.json({ error: "当前已有待处理审核，请先完成或撤销" }, { status: 409 });
    const assignedTo = typeof body?.assignedTo === "string" && body.assignedTo ? body.assignedTo : null;
    if (assignedTo) {
      const reviewer = await db.prepare(`SELECT 1 AS allowed FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'reviewer'
        UNION SELECT 1 FROM writing_projects WHERE id = ? AND owner_user_id = ?`).bind(projectId, assignedTo, projectId, assignedTo).first();
      if (!reviewer) return NextResponse.json({ error: "指定人员没有本项目审核权限" }, { status: 403 });
    }
    const reviewId = crypto.randomUUID();
    const sources = parseSources(version.source_snapshot);
    const sourceByMarker = new Map<string, SourceSnapshot>(
      sources.flatMap((source): Array<[string, SourceSnapshot]> =>
        typeof source.marker === "string" ? [[`【${source.marker}】`, source]] : []),
    );
    const markers = readMarkers(version.content);
    const checks = markers.map((marker) => {
      const source = sourceByMarker.get(marker);
      return { marker, status: !source ? "missing" : source.verified === true ? "valid" : "unverified", source };
    });
    await db.batch([
      db.prepare(`INSERT INTO review_requests
        (id, project_id, version_id, summary, requested_by, assigned_to)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(reviewId, projectId, versionId, typeof body?.summary === "string" ? body.summary.trim().slice(0, 1000) : "", identity.userId, assignedTo),
      ...checks.map((check) => db.prepare(`INSERT INTO citation_checks
        (review_request_id, project_id, version_id, marker, status, source_kind, source_title, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(reviewId, projectId, versionId, check.marker, check.status,
          typeof check.source?.kind === "string" ? check.source.kind : null,
          typeof check.source?.filename === "string" ? check.source.filename : null,
          check.status === "missing" ? "正文引用标记未在版本来源快照中找到" : check.status === "unverified" ? "来源存在，但尚未完成事实核验" : "引用标记与来源快照一致")),
      db.prepare("UPDATE writing_projects SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId),
    ]);
    await writeActivity(db, identity, "review.submitted", "writing_project", projectId, { reviewId, versionId, assignedTo, citationCount: checks.length });
    return NextResponse.json({ id: reviewId, status: "pending", citationSummary: { total: checks.length, valid: checks.filter((item) => item.status === "valid").length, unverified: checks.filter((item) => item.status === "unverified").length, missing: checks.filter((item) => item.status === "missing").length } }, { status: 201 });
  } catch (error: unknown) {
    const status = identityError(error) ? 401 : authorizationError(error) ? 403 : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

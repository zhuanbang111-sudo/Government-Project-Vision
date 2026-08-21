import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "../../../../_platform";
import { authorizationError, identityError, requireProjectAccess, resolveIdentity, writeActivity } from "../../../../_identity";
import { errorMessage } from "../../../../_shared";

export async function GET(request: NextRequest, context: RouteContext<"/api/projects/[id]/exports/[exportId]">) {
  try {
    const { id, exportId } = await context.params;
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const identity = await resolveIdentity(request, APP_DB);
    await requireProjectAccess(APP_DB, identity, id, "viewer");
    const item = await APP_DB.prepare(`SELECT e.object_key, e.filename, e.content_hash
      FROM project_exports e JOIN writing_projects p ON p.id = e.project_id
      WHERE e.id = ? AND e.project_id = ? AND p.workspace_id = ?`).bind(exportId, id, identity.workspaceId)
      .first<{ object_key: string; filename: string; content_hash: string }>();
    if (!item) return NextResponse.json({ error: "导出文件不存在或无权访问" }, { status: 404 });
    const object = await DOCUMENTS_BUCKET.get(item.object_key);
    if (!object) return NextResponse.json({ error: "归档文件在对象存储中不存在" }, { status: 404 });
    await writeActivity(APP_DB, identity, "project.export_downloaded", "writing_project", id, { exportId });
    return new NextResponse(await object.arrayBuffer(), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`,
      "ETag": `"${item.content_hash}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 });
  }
}

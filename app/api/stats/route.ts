import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";
import { documentScope, identityError, resolveIdentity } from "../_identity";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const documentVisibility = documentScope(identity, "documents");
    const isAdmin = identity.systemRole === "admin" || identity.systemRole === "super_admin";
    const projectVisibility = isAdmin ? "1 = 1" : `(owner_user_id = ? OR visibility = 'workspace' OR (visibility = 'department' AND department_id = ?) OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = writing_projects.id AND pm.user_id = ?))`;
    const projectBindings = isAdmin ? [] : [identity.userId, identity.departmentId ?? "", identity.userId];
    const [documents, generations, projects] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE workspace_id = ? AND deleted_at IS NULL AND ${documentVisibility.sql}`).bind(identity.workspaceId, ...documentVisibility.bindings).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM draft_versions dv JOIN writing_projects p ON p.id = dv.project_id
        WHERE p.workspace_id = ? AND dv.stage = 'final' AND ${projectVisibility.replaceAll("owner_user_id", "p.owner_user_id").replaceAll("visibility", "p.visibility").replaceAll("department_id", "p.department_id").replaceAll("writing_projects.id", "p.id")}`).bind(identity.workspaceId, ...projectBindings).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM writing_projects WHERE workspace_id = ? AND archived_at IS NULL AND ${projectVisibility}`).bind(identity.workspaceId, ...projectBindings).first<{ count: number }>(),
    ]);
    const documentCount = documents?.count ?? 0;
    const generatedCount = generations?.count ?? 0;
    return NextResponse.json({ documentCount, generatedCount, projectCount: projects?.count ?? 0, docCount: documentCount, genCount: generatedCount });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 }); }
}

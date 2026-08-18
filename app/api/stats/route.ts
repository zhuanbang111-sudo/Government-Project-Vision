import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";
import { errorMessage } from "../_shared";
import { identityError, resolveIdentity } from "../_identity";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const identity = await resolveIdentity(request, db);
    const [documents, generations, projects] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM documents WHERE workspace_id = ? AND deleted_at IS NULL").bind(identity.workspaceId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM draft_versions dv JOIN writing_projects p ON p.id = dv.project_id
        WHERE p.workspace_id = ? AND dv.stage = 'final'`).bind(identity.workspaceId).first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM writing_projects WHERE workspace_id = ? AND archived_at IS NULL").bind(identity.workspaceId).first<{ count: number }>(),
    ]);
    const documentCount = documents?.count ?? 0;
    const generatedCount = generations?.count ?? 0;
    return NextResponse.json({ documentCount, generatedCount, projectCount: projects?.count ?? 0, docCount: documentCount, genCount: generatedCount });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 100) ?? ""; const term = `%${query}%`;
    const { results } = await db.prepare(`SELECT u.id, u.username, u.email, u.display_name, u.system_role, u.status,
      u.department_id, d.name AS department_name, u.must_change_password, u.last_seen_at, u.created_at,
      (SELECT COUNT(*) FROM writing_projects p WHERE p.owner_user_id = u.id) AS project_count,
      (SELECT COUNT(*) FROM documents doc WHERE doc.owner_user_id = u.id AND doc.deleted_at IS NULL) AS document_count
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE (? = '' OR u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)
      ORDER BY CASE u.system_role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 WHEN 'reviewer' THEN 3 ELSE 4 END, u.created_at DESC LIMIT 300`).bind(query, term, term, term).all();
    return NextResponse.json(results, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


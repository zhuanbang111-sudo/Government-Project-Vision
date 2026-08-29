import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";
export async function GET(request: NextRequest) {
  try { const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity); const { results: activities } = await db.prepare(`SELECT a.id, a.action AS event_type, a.entity_type, a.entity_id, a.details, a.created_at, u.display_name AS actor_name, 'activity' AS source FROM activity_logs a JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 150`).all(); const { results: security } = await db.prepare(`SELECT s.id, s.event_type, 'security' AS entity_type, COALESCE(s.user_id, '') AS entity_id, s.details, s.created_at, COALESCE(u.display_name, '未识别用户') AS actor_name, 'security' AS source FROM security_events s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100`).all(); const logs = [...activities, ...security].sort((a, b) => String((b as { created_at: unknown }).created_at).localeCompare(String((a as { created_at: unknown }).created_at))).slice(0, 200); return NextResponse.json(logs, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


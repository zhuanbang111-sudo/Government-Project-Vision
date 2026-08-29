import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity } from "../../_identity";
import { getDatabase } from "../../_platform";
import { errorMessage } from "../../_shared";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const [users, invites, disabled, sessions, failures] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM users WHERE id <> 'system-owner' OR password_hash IS NOT NULL").first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM invitations WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP AND used_count < max_uses").first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'disabled'").first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM user_sessions WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP").first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) AS count FROM security_events WHERE event_type = 'login' AND success = 0 AND created_at >= datetime('now', '-24 hours')").first<{ count: number }>(),
    ]);
    return NextResponse.json({ users: users?.count ?? 0, activeInvitations: invites?.count ?? 0, disabledUsers: disabled?.count ?? 0, activeSessions: sessions?.count ?? 0, failedLogins24h: failures?.count ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


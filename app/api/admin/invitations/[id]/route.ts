import { NextRequest, NextResponse } from "next/server";
import { authorizationError, identityError, requireSystemRole, resolveIdentity, writeActivity } from "../../../_identity";
import { getDatabase } from "../../../_platform";
import { errorMessage } from "../../../_shared";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/invitations/[id]">) {
  try {
    const db = await getDatabase(); const identity = await resolveIdentity(request, db); requireSystemRole(identity);
    const id = (await context.params).id; const body = await request.json().catch(() => null) as { action?: unknown; expiresInDays?: unknown } | null;
    if (body?.action === "revoke") {
      const result = await db.prepare("UPDATE invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'").bind(id).run();
      if (!result.meta.changes) return NextResponse.json({ error: "邀请码不存在或已撤销" }, { status: 404 });
      await writeActivity(db, identity, "invitation.revoked", "invitation", id); return NextResponse.json({ success: true });
    }
    const days = Math.min(90, Math.max(1, Number(body?.expiresInDays) || 7));
    const result = await db.prepare("UPDATE invitations SET expires_at = datetime('now', ?) WHERE id = ? AND status = 'active'").bind(`+${days} days`, id).run();
    if (!result.meta.changes) return NextResponse.json({ error: "邀请码不存在或已撤销" }, { status: 404 });
    await writeActivity(db, identity, "invitation.extended", "invitation", id, { days }); return NextResponse.json({ success: true });
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error) }, { status: identityError(error) ? 401 : authorizationError(error) ? 403 : 500 }); }
}


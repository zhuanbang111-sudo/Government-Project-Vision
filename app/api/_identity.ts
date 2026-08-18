import type { NextRequest } from "next/server";
import type { D1DatabaseLike } from "./_platform";

export type AppRole = "owner" | "reviewer" | "editor";

export type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  workspaceId: string;
  workspaceName: string;
  authMode: "cloudflare-access" | "compatibility";
};

export class AuthenticationError extends Error {}

const DEFAULT_USER_ID = "system-owner";
const DEFAULT_WORKSPACE_ID = "default-workspace";

async function stableId(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.toLowerCase()));
  return [...new Uint8Array(bytes)].slice(0, 12).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function displayNameFromEmail(email: string) {
  const name = email.split("@")[0]?.trim();
  return name ? name.slice(0, 60) : "授权用户";
}

export async function resolveIdentity(request: NextRequest, db: D1DatabaseLike): Promise<RequestIdentity> {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  const strict = process.env.ACCESS_AUTH_MODE === "required";
  if (!accessEmail && strict) throw new AuthenticationError("请先通过 Cloudflare Access 完成身份验证");

  if (!accessEmail) {
    await db.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(DEFAULT_USER_ID).run();
    return {
      userId: DEFAULT_USER_ID,
      email: "owner@local.invalid",
      displayName: "单人测试用户",
      role: "owner",
      workspaceId: DEFAULT_WORKSPACE_ID,
      workspaceName: "公文写作工作区",
      authMode: "compatibility",
    };
  }

  const userId = `cf-${await stableId(accessEmail)}`;
  const displayName = displayNameFromEmail(accessEmail);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, role, auth_source)
      VALUES (?, ?, ?, 'editor', 'cloudflare-access')`).bind(userId, accessEmail, displayName),
    db.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP, display_name = ? WHERE id = ?").bind(displayName, userId),
    db.prepare(`INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, 'editor')`).bind(DEFAULT_WORKSPACE_ID, userId),
  ]);
  const membership = await db.prepare(`SELECT u.role AS user_role, m.role AS member_role, u.status,
      w.name AS workspace_name
    FROM users u JOIN workspace_members m ON m.user_id = u.id
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE u.id = ? AND m.workspace_id = ?`).bind(userId, DEFAULT_WORKSPACE_ID).first<{
      user_role: AppRole; member_role: AppRole; status: string; workspace_name: string;
    }>();
  if (!membership || membership.status !== "active") throw new AuthenticationError("当前账号未获授权或已被停用");
  return {
    userId,
    email: accessEmail,
    displayName,
    role: membership.member_role,
    workspaceId: DEFAULT_WORKSPACE_ID,
    workspaceName: membership.workspace_name,
    authMode: "cloudflare-access",
  };
}

export async function writeActivity(db: D1DatabaseLike, identity: RequestIdentity, action: string, entityType: string, entityId: string | number, details: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO activity_logs
    (workspace_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(identity.workspaceId, identity.userId, action, entityType, String(entityId), JSON.stringify(details)).run();
}

export function identityError(error: unknown) {
  return error instanceof AuthenticationError;
}

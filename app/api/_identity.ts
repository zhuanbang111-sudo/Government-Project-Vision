import type { NextRequest } from "next/server";
import { enforceSameOrigin, hashText, SESSION_COOKIE, type SystemRole } from "./_auth";
import type { D1DatabaseLike } from "./_platform";

export type AppRole = "owner" | "reviewer" | "editor";
export type ProjectPermission = "viewer" | "editor" | "reviewer" | "owner";
export type RequestIdentity = {
  userId: string; username: string; email: string; displayName: string; role: AppRole; systemRole: SystemRole;
  departmentId: string | null; departmentName: string | null; workspaceId: string; workspaceName: string;
  authMode: "password" | "cloudflare-access" | "compatibility"; mustChangePassword: boolean;
};

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
const DEFAULT_USER_ID = "system-owner";

type IdentityRow = {
  id: string; username: string | null; email: string; display_name: string; status: string; system_role: SystemRole;
  department_id: string | null; department_name: string | null; workspace_id: string; workspace_name: string;
  member_role: AppRole; must_change_password: number;
};

function mapIdentity(row: IdentityRow, authMode: RequestIdentity["authMode"]): RequestIdentity {
  return { userId: row.id, username: row.username ?? row.email, email: row.email, displayName: row.display_name,
    role: row.system_role === "super_admin" || row.system_role === "admin" ? "owner" : row.member_role,
    systemRole: row.system_role, departmentId: row.department_id, departmentName: row.department_name,
    workspaceId: row.workspace_id, workspaceName: row.workspace_name, authMode, mustChangePassword: row.must_change_password === 1 };
}

const identityQuery = `SELECT u.id, u.username, u.email, u.display_name, u.status, u.system_role,
  u.department_id, d.name AS department_name, w.id AS workspace_id, w.name AS workspace_name,
  wm.role AS member_role, u.must_change_password
  FROM users u JOIN workspace_members wm ON wm.user_id = u.id
  JOIN workspaces w ON w.id = wm.workspace_id LEFT JOIN departments d ON d.id = u.department_id`;

export async function resolveIdentity(request: NextRequest, db: D1DatabaseLike): Promise<RequestIdentity> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) enforceSameOrigin(request);
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const row = await db.prepare(`${identityQuery} JOIN user_sessions s ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
      AND u.status = 'active' ORDER BY s.created_at DESC LIMIT 1`).bind(await hashText(sessionToken)).first<IdentityRow>();
    if (row) return mapIdentity(row, "password");
  }
  const accessEmail = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (accessEmail) {
    const row = await db.prepare(`${identityQuery} WHERE lower(u.email) = ? AND u.status = 'active' LIMIT 1`).bind(accessEmail).first<IdentityRow>();
    if (row) return mapIdentity(row, "cloudflare-access");
  }
  if (process.env.AUTH_COMPATIBILITY_MODE === "enabled" && ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)) {
    const row = await db.prepare(`${identityQuery} WHERE u.id = ? LIMIT 1`).bind(DEFAULT_USER_ID).first<IdentityRow>();
    if (row) return mapIdentity(row, "compatibility");
  }
  throw new AuthenticationError("请登录后继续使用系统");
}

export async function writeActivity(db: D1DatabaseLike, identity: RequestIdentity, action: string, entityType: string, entityId: string | number, details: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`).bind(identity.workspaceId, identity.userId, action, entityType, String(entityId), JSON.stringify(details)).run();
}
export function identityError(error: unknown) { return error instanceof AuthenticationError; }
export function authorizationError(error: unknown) { return error instanceof AuthorizationError; }
export function requireSystemRole(identity: RequestIdentity, roles: SystemRole[] = ["admin", "super_admin"]) { if (!roles.includes(identity.systemRole)) throw new AuthorizationError("当前账号没有管理员权限"); }

export function documentScope(identity: RequestIdentity, alias = "documents") {
  const prefix = alias ? `${alias}.` : "";
  // Reference corpora are private by default and by enforcement. System roles may
  // administer accounts and aggregate counts, but never inherit access to user text.
  return { sql: `${prefix}owner_user_id = ?`, bindings: [identity.userId] as unknown[] };
}

const permissionRank: Record<ProjectPermission, number> = { viewer: 1, editor: 2, reviewer: 3, owner: 4 };
export async function requireProjectAccess(db: D1DatabaseLike, identity: RequestIdentity, projectId: string, required: ProjectPermission = "viewer") {
  const project = await db.prepare(`SELECT p.id, p.owner_user_id, p.workspace_id, p.status, p.archived_at, p.visibility, p.department_id,
      pm.role AS member_role FROM writing_projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ? AND p.workspace_id = ?`).bind(identity.userId, projectId, identity.workspaceId).first<{
      id: string; owner_user_id: string; workspace_id: string; status: string; archived_at: string | null;
      visibility: string; department_id: string | null; member_role: ProjectPermission | null;
    }>();
  if (!project) throw new AuthorizationError("项目不存在或无权访问");
  const isAdmin = identity.systemRole === "super_admin" || identity.systemRole === "admin";
  const departmentViewer = project.visibility === "department" && Boolean(identity.departmentId) && project.department_id === identity.departmentId;
  const workspaceViewer = project.visibility === "workspace";
  const permission: ProjectPermission = project.owner_user_id === identity.userId || isAdmin ? "owner" : project.member_role ?? "viewer";
  if (!isAdmin && !project.member_role && project.owner_user_id !== identity.userId && !departmentViewer && !workspaceViewer) throw new AuthorizationError("项目不存在或无权访问");
  if (permissionRank[permission] < permissionRank[required]) throw new AuthorizationError("当前账号没有执行此操作的权限");
  return { ...project, permission };
}

"use client";

import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

type Stats = { users: number; activeInvitations: number; disabledUsers: number; activeSessions: number; failedLogins24h: number };
type Department = { id: string; name: string; code: string; status: string; user_count: number };
type User = { id: string; username: string; email: string; display_name: string; system_role: string; status: string; department_id?: string; department_name?: string; last_seen_at?: string; project_count: number; document_count: number };
type Invite = { id: string; code_hint: string; role: string; department_name?: string; max_uses: number; used_count: number; expires_at: string; status: string; remark?: string };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null); const [users, setUsers] = useState<User[]>([]); const [invites, setInvites] = useState<Invite[]>([]); const [departments, setDepartments] = useState<Department[]>([]);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    const responses = await Promise.all(["stats", "users", "invitations", "departments"].map((name) => fetch(`/api/admin/${name}`)));
    if (responses.some((response) => !response.ok)) throw new Error("无权访问或管理数据加载失败");
    const [statsData, usersData, invitesData, departmentsData] = await Promise.all(responses.map((response) => response.json()));
    setStats(statsData); setUsers(Array.isArray(usersData) ? usersData : []); setInvites(Array.isArray(invitesData) ? invitesData : []); setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
  }, []);
  // The initial request synchronizes the dashboard with server-side administration state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败")); }, [load]);
  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setMessage(""); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const result = await response.json() as { code?: string; error?: string }; if (!response.ok) throw new Error(result.error || "创建失败"); setMessage(`邀请码（仅显示一次）：${result.code}`); event.currentTarget.reset(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败"); } finally { setPending(false); }
  }
  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { const response = await fetch("/api/admin/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "创建失败"); event.currentTarget.reset(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败"); } finally { setPending(false); }
  }
  async function resetPassword(user: User) {
    setError(""); const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" }); const result = await response.json() as { token?: string; error?: string };
    if (!response.ok) { setError(result.error || "生成失败"); return; } setMessage(`${user.display_name} 的重置凭证（30分钟内有效，仅显示一次）：${result.token}`);
  }
  async function updateUser(userId: string, patch: Record<string, string>) {
    setError(""); const response = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error || "更新失败"); return; } await load();
  }
  return <div className="mx-auto max-w-7xl space-y-6">
    <div><p className="text-xs font-bold text-teal-700">第三阶段 · 协同与审核基础</p><h1 className="mt-2 text-3xl font-black text-slate-900">用户与权限管理</h1><p className="mt-2 text-sm text-slate-500">统一管理邀请码、用户、部门和安全状态，所有关键操作进入审计日志。</p></div>
    {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}{message && <p className="break-all rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["用户", stats?.users], ["有效邀请码", stats?.activeInvitations], ["停用账号", stats?.disabledUsers], ["活跃会话", stats?.activeSessions], ["24小时失败登录", stats?.failedLogins24h]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value ?? "—"}</p></div>)}</div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">创建邀请码</h2><p className="mt-1 text-xs text-slate-500">邀请码只在创建成功后显示一次。</p><form onSubmit={createInvite} className="mt-4 grid gap-3 sm:grid-cols-2"><Select name="role" label="预设角色" options={[["user", "普通用户"], ["reviewer", "审核人"], ["admin", "管理员"]]} /><Select name="departmentId" label="归属部门" options={[["", "暂不分配"], ...departments.filter((item) => item.status === "active").map((item) => [item.id, item.name])]} /><Field name="maxUses" label="可使用次数" type="number" defaultValue="1" min="1" max="100" /><Field name="expiresInDays" label="有效天数" type="number" defaultValue="7" min="1" max="90" /><Field name="remark" label="备注" /><button disabled={pending} className="self-end rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white">生成邀请码</button></form></section>
      <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">新增部门</h2><p className="mt-1 text-xs text-slate-500">部门用于限定材料与项目的默认可见范围。</p><form onSubmit={createDepartment} className="mt-4 grid gap-3 sm:grid-cols-2"><Field name="name" label="部门名称" required /><Field name="code" label="英文编码" placeholder="URBAN_DEV" required /><button disabled={pending} className="rounded-lg border border-teal-700 px-4 py-2.5 text-xs font-bold text-teal-700">新增部门</button></form><div className="mt-4 flex flex-wrap gap-2">{departments.map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{item.name} · {item.user_count}</span>)}</div></section>
    </div>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="font-bold">用户清单</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">用户</th><th className="p-3">角色</th><th className="p-3">部门</th><th className="p-3">状态</th><th className="p-3">资产</th><th className="p-3">操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t"><td className="p-3"><p className="font-bold">{user.display_name}</p><p className="mt-1 text-slate-500">{user.username} · {user.email}</p></td><td className="p-3"><select value={user.system_role} disabled={user.system_role === "super_admin"} onChange={(event) => void updateUser(user.id, { role: event.target.value })} className="rounded border bg-white p-1"><option value="user">普通用户</option><option value="reviewer">审核人</option><option value="admin">管理员</option>{user.system_role === "super_admin" && <option value="super_admin">超级管理员</option>}</select></td><td className="p-3"><select value={departments.find((item) => item.name === user.department_name)?.id ?? ""} onChange={(event) => void updateUser(user.id, { departmentId: event.target.value })} className="rounded border bg-white p-1"><option value="">未分配</option>{departments.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td><td className="p-3"><button onClick={() => void updateUser(user.id, { status: user.status === "active" ? "disabled" : "active" })} className={user.status === "active" ? "text-emerald-700" : "text-red-700"}>{user.status === "active" ? "正常（点击停用）" : "已停用（点击启用）"}</button></td><td className="p-3">项目 {user.project_count} · 资料 {user.document_count}</td><td className="p-3"><button onClick={() => void resetPassword(user)} className="font-bold text-teal-700">生成重置凭证</button></td></tr>)}</tbody></table></div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">邀请码记录</h2><div className="mt-3 grid gap-2">{invites.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs"><span className="font-mono font-bold">{invite.code_hint}</span><span>{invite.role} · {invite.department_name ?? "未分配"}</span><span>{invite.used_count}/{invite.max_uses} · {invite.status}</span><span>截至 {new Date(invite.expires_at).toLocaleDateString("zh-CN")}</span></div>)}</div></section>
  </div>;
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) { return <label className="text-xs font-semibold text-slate-600">{label}<input {...props} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm" /></label>; }
function Select({ label, options, ...props }: { label: string; options: string[][] } & SelectHTMLAttributes<HTMLSelectElement>) { return <label className="text-xs font-semibold text-slate-600">{label}<select {...props} className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm">{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }

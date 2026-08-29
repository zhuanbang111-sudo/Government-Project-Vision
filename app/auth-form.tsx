"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";

type Mode = "login" | "register" | "setup" | "reset" | "account";
type InternalInvite = { code: string; label: string; expiresAt: string; remainingUses: number };

const copy: Record<Mode, { eyebrow: string; title: string; subtitle: string; action: string }> = {
  login: { eyebrow: "安全访问", title: "登录工作空间", subtitle: "使用账号进入材料编制与审核工作台。", action: "登录" },
  register: { eyebrow: "内部注册", title: "创建协作账号", subtitle: "内部共享邀请码会自动填入；如收到专属邀请码，也可以直接替换。", action: "注册并进入" },
  setup: { eyebrow: "首次初始化", title: "设置超级管理员", subtitle: "仅首次部署时可使用，完成后初始化入口自动失效。", action: "完成初始化" },
  reset: { eyebrow: "安全恢复", title: "设置新密码", subtitle: "使用管理员生成的一次性重置凭证。", action: "重置密码" },
  account: { eyebrow: "个人账户", title: "修改登录密码", subtitle: "修改后其他设备上的登录会话将自动失效。", action: "保存新密码" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter(); const searchParams = useSearchParams();
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [internalInvite, setInternalInvite] = useState<InternalInvite | null>(null);
  const inviteFromLink = searchParams.get("invite")?.trim() ?? "";
  useEffect(() => {
    if (mode !== "register" || inviteFromLink) return;
    let active = true;
    void fetch("/api/auth/config", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { internalInvite?: InternalInvite | null };
      if (active && result.internalInvite?.code) setInternalInvite(result.internalInvite);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [inviteFromLink, mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget); const values = Object.fromEntries(form.entries());
    const endpoint = mode === "account" ? "/api/auth/change-password" : `/api/auth/${mode === "setup" ? "bootstrap" : mode === "reset" ? "reset-password" : mode}`;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "操作失败，请稍后重试");
      if (mode === "account") { setSuccess("密码已更新"); return; }
      if (mode === "reset") { router.replace("/login?reset=success"); return; }
      const next = searchParams.get("next"); router.replace(next?.startsWith("/") ? next : "/"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请稍后重试"); }
    finally { setPending(false); }
  }
  const config = copy[mode];
  return <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
    <p className="text-xs font-bold tracking-widest text-teal-700">{config.eyebrow}</p><h1 className="mt-2 text-2xl font-black text-slate-900">{config.title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{config.subtitle}</p>
    <form className="mt-7 space-y-4" onSubmit={submit}>
      {mode === "login" && <><Field name="account" label="用户名或邮箱" autoComplete="username" required /><Field name="password" label="密码" type="password" autoComplete="current-password" required /></>}
      {mode === "register" && <>
        {internalInvite && !inviteFromLink && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-teal-800">{internalInvite.label}</p><span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-teal-700">已自动填入</span></div>
          <p className="mt-2 break-all font-mono text-sm font-bold text-slate-900">{internalInvite.code}</p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">剩余 {internalInvite.remainingUses} 次 · 有效期至 {new Date(internalInvite.expiresAt).toLocaleDateString("zh-CN")}</p>
        </div>}
        <Field key={inviteFromLink || internalInvite?.code || "empty-invite"} name="inviteCode" label="邀请码" defaultValue={inviteFromLink || internalInvite?.code || ""} autoComplete="off" required />
        <Field name="displayName" label="姓名" autoComplete="name" required /><Field name="username" label="用户名（字母、数字、点、横线）" autoComplete="username" required /><Field name="email" label="邮箱" type="email" autoComplete="email" required /><Field name="password" label="密码（至少10位，含字母、数字和符号）" type="password" autoComplete="new-password" required />
      </>}
      {mode === "setup" && <><Field name="bootstrapToken" label="初始化凭证" type="password" autoComplete="off" required /><Field name="displayName" label="管理员姓名" autoComplete="name" required /><Field name="email" label="管理员邮箱" type="email" autoComplete="email" required /><Field name="password" label="管理员密码" type="password" autoComplete="new-password" required /></>}
      {mode === "reset" && <><Field name="token" label="重置凭证" defaultValue={searchParams.get("token") ?? ""} autoComplete="off" required /><Field name="password" label="新密码" type="password" autoComplete="new-password" required /></>}
      {mode === "account" && <><Field name="currentPassword" label="当前密码" type="password" autoComplete="current-password" required /><Field name="newPassword" label="新密码" type="password" autoComplete="new-password" required /></>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}{success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{pending ? "正在处理…" : config.action}</button>
    </form>
    {mode === "login" && <p className="mt-5 text-center text-xs text-slate-500">收到邀请码？ <Link className="font-bold text-teal-700" href="/register">创建账号</Link></p>}
    {mode !== "login" && mode !== "account" && <p className="mt-5 text-center text-xs text-slate-500"><Link className="font-bold text-teal-700" href="/login">返回登录</Link></p>}
  </div>;
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block text-xs font-semibold text-slate-700">{label}<input {...props} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>;
}

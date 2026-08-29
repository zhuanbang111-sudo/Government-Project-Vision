import type { NextRequest, NextResponse } from "next/server";
import type { D1DatabaseLike } from "./_platform";

export const SESSION_COOKIE = "gp_session";
// Cloudflare Workers WebCrypto currently caps PBKDF2 at 100,000 iterations.
export const PASSWORD_ITERATIONS = 100_000;
const SESSION_SECONDS = 60 * 60 * 12;
export type SystemRole = "super_admin" | "admin" | "reviewer" | "user";
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) { return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }
function randomHex(byteLength: number) { const bytes = new Uint8Array(byteLength); crypto.getRandomValues(bytes); return bytesToHex(bytes); }
export async function hashText(value: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }

async function derivePassword(password: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)));
}

export function validatePassword(password: string) {
  if (password.length < 10 || password.length > 128) return "密码须为10—128位";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "密码须同时包含字母、数字和特殊字符";
  return null;
}
export function normalizeUsername(value: unknown) { if (typeof value !== "string") return null; const username = value.trim().toLowerCase(); return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username) ? username : null; }
export function normalizeEmail(value: unknown) { if (typeof value !== "string") return null; const email = value.trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160 ? email : null; }
export async function createPasswordHash(password: string) { const salt = randomHex(16); return { hash: await derivePassword(password, salt, PASSWORD_ITERATIONS), salt, iterations: PASSWORD_ITERATIONS }; }

export function constantTimeEqual(left: string, right: string) { const length = Math.max(left.length, right.length); let difference = left.length ^ right.length; for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0); return difference === 0; }
export async function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number) { return constantTimeEqual(await derivePassword(password, salt, iterations), expectedHash); }
export function generateInviteCode() { const raw = randomHex(10).toUpperCase(); return `GOV-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`; }
export function generateResetToken() { return randomHex(32); }
export function requestIp(request: NextRequest) { return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; }

export async function createSession(db: D1DatabaseLike, request: NextRequest, response: NextResponse, userId: string) {
  const token = randomHex(32); const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
  await db.prepare(`INSERT INTO user_sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), userId, await hashText(token), request.headers.get("user-agent")?.slice(0, 300) ?? "", await hashText(requestIp(request)), expires.toISOString(),
  ).run();
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS, priority: "high" });
}

export async function revokeSession(db: D1DatabaseLike, request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL").bind(await hashText(token)).run();
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function validateTurnstile(token: unknown, request: NextRequest) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim(); if (!secret) return;
  if (typeof token !== "string" || !token.trim()) throw new Error("请完成人机验证");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, response: token, remoteip: requestIp(request), idempotency_key: crypto.randomUUID() }), signal: AbortSignal.timeout(10_000) });
  const result: unknown = await response.json();
  if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) throw new Error("人机验证未通过，请重试");
}

export async function writeSecurityEvent(db: D1DatabaseLike, request: NextRequest, eventType: string, success: boolean, identifier = "", userId: string | null = null, details: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO security_events (user_id, event_type, identifier_hash, ip_hash, success, details) VALUES (?, ?, ?, ?, ?, ?)`).bind(userId, eventType, identifier ? await hashText(identifier.toLowerCase()) : "", await hashText(requestIp(request)), success ? 1 : 0, JSON.stringify(details)).run();
}
export async function enforceLoginRateLimit(db: D1DatabaseLike, request: NextRequest, identifier: string) {
  const result = await db.prepare(`SELECT COUNT(*) AS count FROM security_events WHERE event_type = 'login' AND success = 0 AND created_at >= datetime('now', '-15 minutes') AND (identifier_hash = ? OR ip_hash = ?)`).bind(await hashText(identifier.toLowerCase()), await hashText(requestIp(request))).first<{ count: number }>();
  if ((result?.count ?? 0) >= 10) throw new Error("登录尝试过于频繁，请15分钟后重试");
}

export function enforceSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const allowedHosts = [request.nextUrl.host, request.headers.get("host"), request.headers.get("x-forwarded-host")]
      .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
    if (!allowedHosts.includes(originHost)) throw new Error("请求来源校验失败");
  } catch { throw new Error("请求来源校验失败"); }
}

import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "../_platform";
import { getWritingAiSettings, getChatCompletionsUrl, validateWritingAiSettings } from "../_settings";
import { errorMessage } from "../_shared";
import { requireSystemRole, resolveIdentity } from "../_identity";

export const dynamic = "force-dynamic";

class ProviderTestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function providerError(service: string, status: number, payload: unknown) {
  const error = typeof payload === "object" && payload !== null ? (payload as { error?: { message?: unknown; code?: unknown }; message?: unknown }).error : undefined;
  const message = error?.message ?? (payload as { message?: unknown } | null)?.message;
  const code = error?.code;
  return `${service}返回 ${status}${typeof code === "string" || typeof code === "number" ? `（${code}）` : ""}${typeof message === "string" && message.trim() ? `：${message.trim().slice(0, 240)}` : ""}`;
}

async function readJson(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw) as unknown; } catch { return { message: raw.slice(0, 240) }; }
}

async function getSettingsPayload() {
  const { APP_DB } = await getPlatformEnv();
  const [ai, documentCount] = await Promise.all([
    getWritingAiSettings(APP_DB),
    APP_DB.prepare("SELECT COUNT(*) AS count FROM documents").first<{ count: number }>(),
  ]);
  return {
    storage: {
      mode: "cloudflare" as const,
      database: "Cloudflare D1 (APP_DB)",
      objectStorage: "Cloudflare R2 (DOCUMENTS_BUCKET)",
      localConfigurationAvailable: false,
    },
    ai,
    backup: {
      status: "archive-active" as const,
      message: "原始 DOCX 已归档至 R2，元数据与可检索正文保存在 D1。建议另行配置定期导出作为异地备份。",
      documentCount: Number(documentCount?.count ?? 0),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const { APP_DB } = await getPlatformEnv(); requireSystemRole(await resolveIdentity(request, APP_DB));
    return NextResponse.json(await getSettingsPayload());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const env = await getPlatformEnv(); requireSystemRole(await resolveIdentity(request, env.APP_DB));
    const body: unknown = await request.json();
    const { baseUrl, model } = body as { baseUrl?: unknown; model?: unknown };
    const settings = validateWritingAiSettings(baseUrl, model);
    const { APP_DB } = await getPlatformEnv();
    await APP_DB.batch([
      APP_DB.prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP").bind("ai_base_url", settings.baseUrl),
      APP_DB.prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP").bind("ai_model", settings.model),
    ]);
    return NextResponse.json(await getSettingsPayload());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const env = await getPlatformEnv(); requireSystemRole(await resolveIdentity(request, env.APP_DB));
    const body: unknown = await request.json();
    const action = (body as { action?: unknown }).action;
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    if (action === "test-storage") {
      await Promise.all([APP_DB.prepare("SELECT 1 AS ready").first(), DOCUMENTS_BUCKET.head("__settings_connection_check__")]);
      return NextResponse.json({ ok: true, message: "D1 与 R2 连接正常" });
    }
    if (action === "test-ai") {
      const ai = await getWritingAiSettings(APP_DB);
      if (!ai.apiKeyConfigured) return NextResponse.json({ ok: false, message: "未检测到 DEEPSEEK_API_KEY Cloudflare Secret" }, { status: 400 });
      const response = await fetch(new URL("/models", ai.baseUrl), {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new ProviderTestError(providerError("DeepSeek AI 服务", response.status, payload), response.status);
      return NextResponse.json({ ok: true, message: `AI 服务连接正常（${ai.model}）`, endpoint: getChatCompletionsUrl(ai.baseUrl) });
    }
    if (action === "test-embedding") {
      const apiKey = process.env.ZHIPU_API_KEY;
      if (!apiKey) return NextResponse.json({ ok: false, message: "未检测到 ZHIPU_API_KEY Cloudflare Secret" }, { status: 400 });
      const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "embedding-3", input: "政府公文语料向量化连接测试" }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new ProviderTestError(providerError("智谱向量服务", response.status, payload), response.status);
      const vector = (payload as { data?: Array<{ embedding?: unknown }> }).data?.[0]?.embedding;
      if (!Array.isArray(vector) || !vector.every((item) => typeof item === "number")) {
        throw new Error("智谱向量服务未返回有效向量");
      }
      return NextResponse.json({ ok: true, message: `智谱向量服务连接正常（embedding-3，${vector.length} 维）` });
    }
    return NextResponse.json({ error: "不支持的连接测试类型" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProviderTestError) {
      return NextResponse.json({ ok: false, status: error.status, message: error.message, retryable: error.status === 429 || error.status >= 500 });
    }
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 502 });
  }
}

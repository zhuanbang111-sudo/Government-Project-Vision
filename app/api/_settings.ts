import type { D1DatabaseLike } from "./_platform";

const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
const DEFAULT_AI_MODEL = "deepseek-chat";
const TRUSTED_AI_ORIGINS = new Set(["https://api.deepseek.com"]);

type SettingRow = { setting_key: string; setting_value: string };

export type WritingAiSettings = {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  embeddingKeyConfigured: boolean;
};

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!TRUSTED_AI_ORIGINS.has(parsed.origin) || parsed.pathname !== "/") {
    throw new Error("当前仅允许使用已审核的 DeepSeek API 地址 https://api.deepseek.com");
  }
  return parsed.origin;
}

export function validateWritingAiSettings(baseUrl: unknown, model: unknown) {
  if (typeof baseUrl !== "string" || typeof model !== "string") throw new Error("AI 地址和模型名称不能为空");
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedModel = model.trim();
  if (!/^[a-zA-Z0-9._-]{2,80}$/.test(normalizedModel)) throw new Error("模型名称格式无效");
  return { baseUrl: normalizedBaseUrl, model: normalizedModel };
}

export async function getWritingAiSettings(db: D1DatabaseLike): Promise<WritingAiSettings> {
  const { results } = await db.prepare("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('ai_base_url', 'ai_model')").all<SettingRow>();
  const values = new Map(results.map((row) => [row.setting_key, row.setting_value]));
  let baseUrl = DEFAULT_AI_BASE_URL;
  try { baseUrl = values.has("ai_base_url") ? normalizeBaseUrl(values.get("ai_base_url")!) : DEFAULT_AI_BASE_URL; } catch { baseUrl = DEFAULT_AI_BASE_URL; }
  const configuredModel = values.get("ai_model")?.trim();
  const model = configuredModel && /^[a-zA-Z0-9._-]{2,80}$/.test(configuredModel) ? configuredModel : process.env.DEEPSEEK_MODEL || DEFAULT_AI_MODEL;
  return { baseUrl, model, apiKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY), embeddingKeyConfigured: Boolean(process.env.ZHIPU_API_KEY) };
}

export function getChatCompletionsUrl(baseUrl: string) {
  return new URL("/chat/completions", baseUrl).toString();
}

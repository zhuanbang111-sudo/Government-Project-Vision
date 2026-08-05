import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{ meta: { changes?: number; last_row_id?: number } }>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

type R2BucketLike = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
};

type PlatformEnv = {
  APP_DB?: D1DatabaseLike;
  DOCUMENTS_BUCKET?: R2BucketLike;
};

export async function getPlatformEnv(): Promise<Required<PlatformEnv>> {
  const { env } = await getCloudflareContext({ async: true });
  const platformEnv = env as PlatformEnv;
  if (!platformEnv.APP_DB || !platformEnv.DOCUMENTS_BUCKET) {
    throw new Error("Cloudflare D1 / R2 bindings are not configured");
  }
  return { APP_DB: platformEnv.APP_DB, DOCUMENTS_BUCKET: platformEnv.DOCUMENTS_BUCKET };
}

export async function getDatabase(): Promise<D1DatabaseLike> {
  const { APP_DB } = await getPlatformEnv();
  return APP_DB;
}

export function placeholders(values: readonly unknown[]) {
  return values.map(() => "?").join(", ");
}

import "server-only";
import { createHash } from "node:crypto";
import { env, qlooMockMode } from "../env";
import { store } from "../store";
import { spendQlooCall } from "./budget";
import { mockQloo } from "./mock";
import {
  QlooError,
  type QlooInsightsResponse,
  type QlooParams,
  type QlooSearchResponse,
} from "./types";

// Qloo allows private server-side caching with no time limit. Responses live
// only in our database, never in the repo.
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

// Key limit is 5 requests/second. Stay a little under it.
const MIN_GAP_MS = 220;
let nextSlot = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Arrays are sent comma-joined in one param; empty values are dropped. */
export function toQuery(params: QlooParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return search.toString();
}

async function request<T>(path: string, params: QlooParams): Promise<T> {
  const query = toQuery(params);

  if (qlooMockMode) return mockQloo(path, params) as T;

  const cacheKey = `qloo:${createHash("sha256").update(`${path}?${query}`).digest("hex")}`;
  const cached = await store.get<T>(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; ; attempt++) {
    await spendQlooCall();
    await throttle();
    const response = await fetch(`${env.qlooBaseUrl}${path}?${query}`, {
      headers: { "X-Api-Key": env.qlooApiKey!, Accept: "application/json" },
      cache: "no-store",
    });

    if (response.ok) {
      const body = (await response.json()) as T;
      await store.set(cacheKey, body, CACHE_TTL_SECONDS);
      return body;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * (attempt + 1)));
      continue;
    }

    const body = await response.json().catch(() => ({}));
    const message = body.message ?? body.reason ?? body.error ?? response.statusText;
    throw new QlooError(`Qloo ${path} ${response.status}: ${message}`, response.status);
  }
}

export const qloo = {
  insights: (params: QlooParams) => request<QlooInsightsResponse>("/v2/insights", params),
  search: (params: QlooParams) => request<QlooSearchResponse>("/search", params),
  tags: (params: QlooParams) => request<QlooInsightsResponse>("/v2/tags", params),
};

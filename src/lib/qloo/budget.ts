import "server-only";
import { env, qlooMockMode } from "../env";
import { store } from "../store";
import { QlooLimitError } from "./types";

// One shared daily cap on live Qloo calls, for the whole app. No per-visitor
// tracking. Cache hits and mock calls are free and never counted.

const DAY_SECONDS = 60 * 60 * 24;

/** A new plan makes about 16 Qloo calls when nothing is cached. */
export const CALLS_PER_PLAN = 20;

const todayKey = () => `qloo-calls:${new Date().toISOString().slice(0, 10)}`;

/** Counts one live call. Throws once today's cap is reached. */
export async function spendQlooCall() {
  const used = await store.increment(todayKey(), 2 * DAY_SECONDS);
  if (used > env.qlooDailyCap) throw new QlooLimitError();
}

/** Live calls left today. Infinite in mock mode. */
export async function qlooCallsLeft() {
  if (qlooMockMode) return Number.POSITIVE_INFINITY;
  return Math.max(0, env.qlooDailyCap - (await store.count(todayKey())));
}

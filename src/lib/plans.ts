import "server-only";
import type { TourPlan } from "./agent/plan-schema";
import { store } from "./store";

// Finished plans, kept privately for 30 days so the same artist + region +
// stop count opens instantly and makes no new Qloo calls.

const PLAN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SavedPlan = { plan: TourPlan; createdAt: string };

const planKey = (artistId: string, regionId: string, stops: number) => `plan:${artistId}:${regionId}:${stops}`;

export function getSavedPlan(artistId: string, regionId: string, stops: number) {
  return store.get<SavedPlan>(planKey(artistId, regionId, stops));
}

export async function savePlan(artistId: string, regionId: string, stops: number, plan: TourPlan) {
  const saved: SavedPlan = { plan, createdAt: new Date().toISOString() };
  await store.set(planKey(artistId, regionId, stops), saved, PLAN_TTL_SECONDS);
}

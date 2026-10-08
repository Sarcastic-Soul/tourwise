import { connection } from "next/server";
import { Suspense } from "react";
import { TourPlanner, type Initial } from "@/components/tour-planner";
import { qlooMockMode } from "@/lib/env";
import { getSavedPlan } from "@/lib/plans";
import { getRegion } from "@/lib/regions";

const STOP_OPTIONS = [3, 4, 5, 6, 7, 8];

/** A shared link (?artist=&name=&region=&stops=) opens with its saved plan, if any. */
async function readLink(params: Record<string, string | string[] | undefined>): Promise<Initial | undefined> {
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const qlooId = one("artist");
  const name = one("name");
  const region = getRegion(one("region") ?? "");
  if (!qlooId || !name || !region || qlooId.length > 64 || name.length > 120) return undefined;

  const count = Number(one("stops"));
  const stops = STOP_OPTIONS.includes(count) ? count : 5;
  const saved = await getSavedPlan(qlooId, region.id, stops).catch(() => undefined);
  return { artist: { qlooId, name }, regionId: region.id, stops, saved: saved ?? null };
}

// The empty planner is the static shell. A shared link streams in its saved
// plan in place of it.
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<TourPlanner demoData={qlooMockMode} />}>
      <LinkedPlanner searchParams={searchParams} />
    </Suspense>
  );
}

async function LinkedPlanner({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  // Saved plans are read per request, never baked into a prerender.
  await connection();
  const initial = await readLink(params);
  return <TourPlanner demoData={qlooMockMode} initial={initial} />;
}

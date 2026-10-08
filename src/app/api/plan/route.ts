import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { createTourAgent } from "@/lib/agent/tour-agent";
import { tourPlan } from "@/lib/agent/plan-schema";
import { getSavedPlan, savePlan } from "@/lib/plans";
import { CALLS_PER_PLAN, qlooCallsLeft } from "@/lib/qloo/budget";
import { QlooLimitError } from "@/lib/qloo/types";
import { getRegion } from "@/lib/regions";

// The agent loop makes several LLM and Qloo calls; give it room.
export const maxDuration = 300;

const body = z.object({
  artist: z.object({ qlooId: z.string().min(1).max(64), name: z.string().min(1).max(120) }),
  regionId: z.string(),
  stops: z.number().int().min(3).max(8).default(5),
});

/** Returns a saved plan for this artist + region + stop count, if one exists. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const saved = await getSavedPlan(
    params.get("artistId") ?? "",
    params.get("regionId") ?? "",
    Number(params.get("stops") ?? 5),
  );
  return Response.json(saved ?? { plan: null });
}

/** Runs the tour agent and streams its steps (tool calls, results, final plan). */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { artist, regionId, stops } = parsed.data;
  const region = getRegion(regionId);
  if (!region) return Response.json({ error: "Unknown region" }, { status: 400 });

  if ((await qlooCallsLeft()) < CALLS_PER_PLAN) {
    return Response.json({ error: new QlooLimitError().message }, { status: 429 });
  }

  const agent = createTourAgent({ artist, region, stops });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: `Plan a ${stops}-stop ${region.label} tour for ${artist.name}.` }],
      },
    ],
    abortSignal: request.signal,
    onStepEnd: async (step) => {
      const call = step.toolCalls.find((c) => c.toolName === "submit_plan");
      if (!call) return;
      const plan = tourPlan.safeParse(call.input);
      if (!plan.success) return;
      // Trust our own city coordinates over numbers the model copied.
      const cities = new Map(region.cities.map((c) => [c.name.toLowerCase(), c]));
      for (const stop of plan.data.stops) {
        const city = cities.get(stop.city.toLowerCase());
        if (city) Object.assign(stop, { lat: city.lat, lng: city.lng, country: city.country });
      }
      await savePlan(artist.qlooId, region.id, stops, plan.data);
    },
    onError: (error) => {
      console.error("[plan]", error);
      return "The planner hit a problem. Please try again in a minute.";
    },
  });
}

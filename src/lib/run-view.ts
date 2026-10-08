// Turns the agent's streamed message parts into what the page shows: the step
// log, the map layers and the (possibly still streaming) plan. Client-safe.

import type { DeepPartial } from "ai";
import type { TourAgentUIMessage } from "./agent/tour-agent";
import type { TourPlan } from "./agent/plan-schema";

type Part = TourAgentUIMessage["parts"][number];
type PartOf<T extends Part["type"]> = Extract<Part, { type: T }>;

export type StepStatus = "waiting" | "running" | "done" | "error";
export type Step = { id: string; title: string; detail: string; status: StepStatus };

export type Hotspot = { name: string; lat: number; lng: number; score: number };

export type RunView = {
  steps: Step[];
  hotspots: Hotspot[];
  /** Cities the agent is scouting or has scouted, by name. */
  scouted: Map<string, "running" | "done">;
  plan: DeepPartial<TourPlan> | undefined;
  planDone: boolean;
  /** The agent's last text, shown when it stops without a plan. */
  note: string | undefined;
};

function partsOf<T extends Part["type"]>(parts: Part[], type: T): PartOf<T>[] {
  return parts.filter((p): p is PartOf<T> => p.type === type);
}

function statusOf(part: { state: string } | undefined, doneState = "output-available"): StepStatus {
  if (!part) return "waiting";
  if (part.state === doneState || part.state === "output-available") return "done";
  if (part.state === "output-error") return "error";
  return "running";
}

const listNames = (names: string[], max = 3) =>
  names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", ");

export function deriveRun(
  messages: TourAgentUIMessage[],
  { regionLabel, active }: { regionLabel: string; active: boolean },
): RunView {
  const parts = messages.filter((m) => m.role === "assistant").flatMap((m) => m.parts);

  const hotspotPart = partsOf(parts, "tool-audience_hotspots").at(-1);
  const profilePart = partsOf(parts, "tool-audience_profile").at(-1);
  const scoutParts = partsOf(parts, "tool-scout_city");
  const routePart = partsOf(parts, "tool-plan_route").at(-1);
  const planPart = partsOf(parts, "tool-submit_plan").at(-1);

  const hotspots: Hotspot[] =
    hotspotPart?.state === "output-available"
      ? hotspotPart.output.hotspots.map(({ name, lat, lng, score }) => ({ name, lat, lng, score }))
      : [];

  const similar =
    profilePart?.state === "output-available" ? profilePart.output.similarArtists.map((a) => a.name) : [];

  const scouted = new Map<string, "running" | "done">();
  for (const part of scoutParts) {
    const city = part.input?.city;
    if (city) scouted.set(city, part.state === "output-available" || part.state === "output-error" ? "done" : "running");
  }
  const scoutNames = [...scouted.keys()];
  const scoutStatus: StepStatus =
    scoutParts.length === 0 ? "waiting" : [...scouted.values()].includes("running") ? "running" : "done";

  const route = routePart?.state === "output-available" ? routePart.output : undefined;
  const plan = planPart?.input;
  const planDone = planPart?.state === "input-available";

  const steps: Step[] = [
    {
      id: "hotspots",
      title: "Find audience hotspots",
      status: statusOf(hotspotPart),
      detail: hotspots.length
        ? `${hotspots.length} cities with listeners`
        : `Qloo heatmap over ${regionLabel}`,
    },
    {
      id: "profile",
      title: "Read audience profile",
      status: statusOf(profilePart),
      detail: similar.length ? `Shared taste: ${listNames(similar, 2)}` : "Age, gender, similar artists",
    },
    {
      id: "scout",
      title: scoutStatus === "done" ? `Scouted ${scoutNames.length} cities` : "Scout cities",
      status: scoutStatus,
      detail: scoutNames.length ? listNames(scoutNames) : "Venues, openers, brands",
    },
    {
      id: "route",
      title: "Order the route",
      status: statusOf(routePart),
      detail: route
        ? `${route.totalKm.toLocaleString("en")} km over ${route.legsKm.length} legs`
        : "Shortest order between stops",
    },
    {
      id: "plan",
      title: planDone ? "Plan ready" : "Write the plan",
      status: statusOf(planPart, "input-available"),
      detail:
        planDone && plan?.stops
          ? `${plan.stops.length} stops, ${plan.skippedCities?.length ?? 0} cities skipped`
          : "Picks with Qloo evidence",
    },
  ];

  // Before the first tool call, show the first step as working.
  if (active && steps.every((s) => s.status === "waiting")) {
    steps[0] = { ...steps[0], status: "running", detail: "Starting the agent" };
  }
  // A run that ended early leaves its unfinished steps marked as failed.
  if (!active) {
    for (const step of steps) if (step.status === "running") step.status = "error";
  }

  const lastText = parts.filter((p) => p.type === "text").at(-1);
  return {
    steps,
    hotspots,
    scouted,
    plan,
    planDone,
    note: lastText && "text" in lastText ? lastText.text : undefined,
  };
}

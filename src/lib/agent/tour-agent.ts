import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { distanceKm, orderRoute } from "../geo";
import { agentModel } from "../llm/models";
import {
  audienceHotspots,
  audienceProfile,
  brandsNear,
  localArtists,
  similarArtists,
  venuesNear,
} from "../qloo/workflows";
import type { Region } from "../regions";
import { tourPlan } from "./plan-schema";

export type TourRequest = {
  artist: { qlooId: string; name: string };
  region: Region;
  stops: number;
};

function instructions({ artist, region, stops }: TourRequest) {
  return `You plan tours for independent musicians using Qloo taste data.

Artist: ${artist.name} (Qloo id ${artist.qlooId})
Region: ${region.label}
Target: ${stops} stops

Work in this order:
1. Call audience_hotspots and audience_profile (you can call both at once).
2. Pick about ${stops + 2} candidate cities from the hotspots. Favour strong audience scores, but skip a city when a nearby city is stronger and would split the same crowd.
3. Call scout_city for each candidate (call them in parallel).
4. Choose the final ${stops} stops: a city needs a real venue match to make the cut. Pick each stop's venue, support act and up to 3 sponsor brands only from scout_city results.
5. Call plan_route with the chosen cities to get the travel order.
6. Call submit_plan once, with stops in the plan_route order.

Rules:
- Use only names and ids that tools returned. Never invent venues, artists, brands or numbers.
- Every stop needs evidence: the Qloo signals behind it (audience score, affinity values).
- Qloo data is aggregate taste affinity, not facts about people. Do not make claims about individual fans, identity, income or causes.
- If a tool fails with a Qloo budget error, stop and say so in one sentence. Do not submit a plan.
- Keep text short and plain.`;
}

export function createTourAgent(request: TourRequest) {
  const { artist, region } = request;
  const cityByName = new Map(region.cities.map((c) => [c.name.toLowerCase(), c]));
  const findCity = (name: string) => cityByName.get(name.trim().toLowerCase());
  const cityNames = region.cities.map((c) => c.name);
  const nearestCity = (lat: number, lng: number) => {
    let best: (typeof region.cities)[number] | undefined;
    let bestKm = 80;
    for (const c of region.cities) {
      const km = distanceKm({ name: "", lat, lng }, c);
      if (km < bestKm) [best, bestKm] = [c, km];
    }
    return best;
  };

  return new ToolLoopAgent({
    model: agentModel(),
    instructions: instructions(request),
    stopWhen: isStepCount(12),
    maxRetries: 1,
    // Small models sometimes drop a stop's city name but keep its coordinates.
    // Fill the name back in from the region's city list instead of losing the run.
    repairToolCall: async ({ toolCall }) => {
      if (toolCall.toolName !== "submit_plan") return null;
      try {
        const input = JSON.parse(toolCall.input);
        let changed = false;
        for (const stop of input.stops ?? []) {
          if (stop.city || typeof stop.lat !== "number" || typeof stop.lng !== "number") continue;
          const city = nearestCity(stop.lat, stop.lng);
          if (!city) continue;
          stop.city = city.name;
          stop.country ??= city.country;
          changed = true;
        }
        return changed ? { ...toolCall, input: JSON.stringify(input) } : null;
      } catch {
        return null;
      }
    },
    tools: {
      audience_hotspots: tool({
        description: `Cities in ${region.label} where ${artist.name}'s taste audience is concentrated, from a Qloo heatmap. Scores 0-1.`,
        inputSchema: z.object({}),
        execute: async () => ({ hotspots: await audienceHotspots(artist.qlooId, region) }),
      }),

      audience_profile: tool({
        description: `Who ${artist.name}'s audience is: Qloo age and gender lean (about -1..1, positive = above average) plus artists the same audience likes.`,
        inputSchema: z.object({}),
        execute: async () => {
          const [profile, similar] = await Promise.all([
            audienceProfile(artist.qlooId),
            similarArtists(artist.qlooId, 8),
          ]);
          return { ...profile, similarArtists: similar.map(({ name, affinity }) => ({ name, affinity })) };
        },
      }),

      scout_city: tool({
        description: "For one city: venues whose crowd matches the audience, artists the audience likes there (support acts), and brands the audience likes there (sponsors).",
        inputSchema: z.object({
          city: z.enum(cityNames as [string, ...string[]]).describe("A city name from audience_hotspots"),
        }),
        execute: async ({ city: name }) => {
          const city = findCity(name);
          if (!city) return { error: `Unknown city ${name}` };
          const [venues, supportActs, brands] = await Promise.all([
            venuesNear(artist.qlooId, city),
            localArtists(artist.qlooId, city),
            brandsNear(artist.qlooId, city),
          ]);
          return {
            city: city.name,
            venues: venues.map(({ qlooId, name, affinity, address, rating, tags }) => ({ qlooId, name, affinity, address, rating, tags })),
            supportActs: supportActs.map(({ qlooId, name, affinity, popularity }) => ({ qlooId, name, affinity, popularity })),
            brands: brands.map(({ qlooId, name, affinity }) => ({ qlooId, name, affinity })),
          };
        },
      }),

      plan_route: tool({
        description: "Orders chosen cities to keep total travel short. Returns the order and the distance of each leg.",
        inputSchema: z.object({
          cities: z.array(z.string()).min(2).max(10),
          startCity: z.string().optional().describe("Where the tour should start, if it matters"),
        }),
        execute: async ({ cities, startCity }) => {
          const points = cities.map(findCity).filter((c) => c !== undefined);
          const { route, totalKm, legsKm } = orderRoute(
            points.map((c) => ({ name: c.name, lat: c.lat, lng: c.lng })),
            startCity && findCity(startCity)?.name,
          );
          return {
            order: route.map((p) => p.name),
            legsKm,
            totalKm,
            unknownCities: cities.filter((c) => !findCity(c)),
          };
        },
      }),

      // No execute: calling it ends the loop, and the client reads the plan
      // from the tool call input.
      submit_plan: tool({
        description: "Submit the finished tour plan. Call once, at the end.",
        inputSchema: tourPlan,
      }),
    },
  });
}

/** Message type the client reads tool parts from. Type only, so safe to import in client code. */
export type TourAgentUIMessage = InferAgentUIMessage<ReturnType<typeof createTourAgent>>;

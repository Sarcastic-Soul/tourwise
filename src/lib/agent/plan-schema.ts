import { z } from "zod";

// The finished tour plan. The agent submits it through the `submit_plan` tool,
// which works the same on every model in the fallback chain (unlike native
// structured output, which not every free model supports alongside tools).

const evidence = z
  .string()
  .describe("A Qloo signal behind this pick, in plain words, e.g. 'Audience affinity 0.82, top 3 city'");

const pick = z.object({
  qlooId: z.string().describe("Qloo entity_id exactly as a tool returned it"),
  name: z.string(),
  why: z.string().describe("One sentence on why it fits, based only on tool results"),
});

export const tourStop = z.object({
  order: z.number().int().min(1),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  audienceScore: z.number().min(0).max(1).describe("Audience strength for this city from audience_hotspots"),
  why: z.string().describe("Why this city is on the tour, 1-2 sentences"),
  venue: pick.nullable(),
  supportAct: pick.nullable(),
  sponsorBrands: z.array(pick).max(3),
  evidence: z.array(evidence).min(1).max(4),
});

export const tourPlan = z.object({
  headline: z.string().describe("One-line summary of the tour strategy"),
  audienceSummary: z.string().describe("Who the audience is, from Qloo audience data. No claims about individuals."),
  stops: z.array(tourStop).min(3).max(8),
  skippedCities: z
    .array(z.object({ city: z.string(), reason: z.string() }))
    .max(5)
    .describe("Strong audience cities left out, and why (routing, overlap, no venue data)"),
  caveats: z.array(z.string()).max(4).describe("Limits of the data the artist should know"),
});

export type TourStop = z.infer<typeof tourStop>;
export type TourPlan = z.infer<typeof tourPlan>;

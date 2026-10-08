import "server-only";
import { createHash } from "node:crypto";
import { REGIONS } from "../regions";
import type {
  QlooEntity,
  QlooHeatmapPoint,
  QlooInsightsResponse,
  QlooParams,
  QlooSearchResponse,
} from "./types";

// Made-up data in the real Qloo response shape, used until the API key
// arrives. Every name here is fictional. Output is deterministic per input so
// the UI and agent behave the same on every run.

function seeded(seed: string) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function fakeId(seed: string) {
  const h = createHash("md5").update(seed).digest("hex").toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

const ADJECTIVES = ["Velvet", "Paper", "Static", "Golden", "Hollow", "Neon", "Quiet", "Wild", "Lunar", "Copper", "Glass", "Salt"];
const NOUNS = ["Harbor", "Lanterns", "Moths", "Satellites", "Orchard", "Tides", "Foxes", "Parade", "Engines", "Choir", "Rivers", "Signals"];
const VENUE_A = ["The Lantern", "Basement", "Blue Door", "The Foundry", "Low Light", "Old Mill", "The Echo", "Night Owl", "Union", "Little Cellar"];
const VENUE_B = ["Room", "Hall", "Social Club", "Music House", "Taproom", "Ballroom", "Lounge", "Theatre"];
const BRAND_A = ["North", "Field", "Common", "Hearth", "Atlas", "Juniper", "Tandem", "Ember", "Fable", "Kettle"];
const BRAND_B = ["Coffee Co.", "Outfitters", "Brewing", "Audio", "Denim", "Records", "Cycles", "Goods", "Kombucha", "Vinyl"];

function parsePoint(value: unknown): { lat: number; lng: number } | undefined {
  const match = /POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(String(value ?? ""));
  return match ? { lng: Number(match[1]), lat: Number(match[2]) } : undefined;
}

function parseBbox(value: unknown): [number, number, number, number] | undefined {
  const nums = [...String(value ?? "").matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (nums.length < 3) return undefined;
  const lngs = nums.map((n) => n[0]);
  const lats = nums.map((n) => n[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function entities(
  seed: string,
  take: number,
  make: (rand: () => number, i: number) => Omit<QlooEntity, "entity_id" | "query">,
): QlooEntity[] {
  const rand = seeded(seed);
  return Array.from({ length: take }, (_, i) => {
    const base = make(rand, i);
    return {
      ...base,
      entity_id: fakeId(`${seed}:${i}:${base.name}`),
      type: "urn:entity",
      query: { affinity: Number((0.97 - i * (0.03 + rand() * 0.03)).toFixed(3)) },
    };
  });
}

function insights(params: QlooParams): QlooInsightsResponse {
  const type = String(params["filter.type"] ?? "");
  const signal = String(params["signal.interests.entities"] ?? "");
  const take = Math.min(Number(params.take ?? 10), 50);
  const near = parsePoint(params["filter.location"]) ?? parsePoint(params["signal.location"]);
  const seed = `${type}|${signal}|${near?.lat}|${near?.lng}`;

  switch (type) {
    case "urn:entity:artist":
      return {
        success: true,
        results: {
          entities: entities(seed, take, (rand) => ({
            name: `${pick(rand, ADJECTIVES)} ${pick(rand, NOUNS)}`,
            subtype: "urn:entity:artist",
            popularity: Number((0.4 + rand() * 0.5).toFixed(3)),
            tags: [{ id: "urn:tag:genre:music:indie", name: "Indie", type: "urn:tag:genre:music" }],
          })),
        },
      };

    case "urn:entity:place": {
      const center = near ?? { lat: 0, lng: 0 };
      return {
        success: true,
        results: {
          entities: entities(seed, take, (rand) => ({
            name: `${pick(rand, VENUE_A)} ${pick(rand, VENUE_B)}`,
            subtype: "urn:entity:place",
            popularity: Number((0.5 + rand() * 0.45).toFixed(3)),
            location: { lat: center.lat + (rand() - 0.5) * 0.06, lon: center.lng + (rand() - 0.5) * 0.06 },
            properties: {
              address: `${Math.floor(rand() * 900) + 10} Mock Street`,
              business_rating: Number((3.8 + rand() * 1.1).toFixed(1)),
            },
            tags: [
              { id: "urn:tag:genre:place:restaurant:bar", name: "Bar", type: "urn:tag:genre:place" },
              { id: "urn:tag:mock:live_music", name: "Live Music", type: "urn:tag:amenity:place" },
            ],
          })),
        },
      };
    }

    case "urn:entity:brand":
      return {
        success: true,
        results: {
          entities: entities(seed, take, (rand) => ({
            name: `${pick(rand, BRAND_A)} ${pick(rand, BRAND_B)}`,
            subtype: "urn:entity:brand",
            popularity: Number((0.3 + rand() * 0.6).toFixed(3)),
          })),
        },
      };

    case "urn:heatmap": {
      const bbox = parseBbox(params["filter.location"]);
      const region = REGIONS.find((r) => bbox && Math.abs(r.bbox[0] - bbox[0]) < 1 && Math.abs(r.bbox[1] - bbox[1]) < 1);
      const rand = seeded(`${seed}|${bbox}`);
      const heatmap: QlooHeatmapPoint[] = [];
      for (const city of region?.cities ?? []) {
        const strength = rand();
        const points = 1 + Math.floor(strength * 4);
        for (let i = 0; i < points; i++) {
          heatmap.push({
            location: { latitude: city.lat + (rand() - 0.5) * 0.2, longitude: city.lng + (rand() - 0.5) * 0.2 },
            query: { affinity: Number(Math.min(1, strength * (0.7 + rand() * 0.3)).toFixed(3)), popularity: Number(rand().toFixed(3)) },
          });
        }
      }
      return { success: true, results: { heatmap } };
    }

    case "urn:demographics": {
      const rand = seeded(seed);
      const score = () => Number((rand() * 1.6 - 0.8).toFixed(2));
      return {
        success: true,
        results: {
          demographics: [
            {
              entity_id: signal,
              query: {
                age: {
                  "24_and_younger": score(),
                  "25_to_29": score(),
                  "30_to_34": score(),
                  "35_to_44": score(),
                  "45_to_54": score(),
                  "55_and_older": score(),
                },
                gender: { male: score(), female: score() },
              },
            },
          ],
        },
      };
    }

    default:
      return { success: true, results: { entities: [] } };
  }
}

function search(params: QlooParams): QlooSearchResponse {
  const query = String(params.query ?? "").trim();
  if (!query) return { success: true, results: [] };
  const name = query.replace(/\b\w/g, (c) => c.toUpperCase());
  const rand = seeded(`search|${query.toLowerCase()}`);
  return {
    success: true,
    results: [name, `${name} & The ${pick(rand, NOUNS)}`, `${pick(rand, ADJECTIVES)} ${name}`].map((n, i) => ({
      entity_id: fakeId(`artist:${n.toLowerCase()}`),
      name: n,
      types: ["urn:entity:artist"],
      popularity: Number((0.85 - i * 0.2).toFixed(3)),
      disambiguation: i === 0 ? "Demo data (Qloo key not set)" : undefined,
    })),
  };
}

export function mockQloo(path: string, params: QlooParams): QlooInsightsResponse | QlooSearchResponse {
  if (path === "/search") return search(params);
  if (path === "/v2/insights") return insights(params);
  return { success: true, results: { tags: [] } };
}

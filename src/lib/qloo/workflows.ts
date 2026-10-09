import "server-only";
import { distanceKm } from "../geo";
import { type City, type Region, regionPolygon } from "../regions";
import { qloo } from "./client";
import type { QlooEntity, QlooHeatmapPoint } from "./types";

// Higher-level Qloo calls the agent tools use. Each returns small, plain
// objects so tool results stay short in the model's context.

export type EntitySummary = {
  qlooId: string;
  name: string;
  affinity: number | null;
  popularity: number | null;
  imageUrl?: string;
  tags?: string[];
};

export type PlaceSummary = EntitySummary & {
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
};

const round = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 1000) / 1000 : null);

function summarize(entity: QlooEntity): EntitySummary {
  return {
    qlooId: entity.entity_id,
    name: entity.name,
    affinity: round(entity.query?.affinity),
    popularity: round(entity.popularity),
    imageUrl: entity.properties?.image?.url,
    tags: entity.tags?.slice(0, 4).map((t) => t.name),
  };
}

function coords(entity: QlooEntity): { lat?: number; lng?: number } {
  const loc = entity.location ?? {};
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lon ?? loc.lng ?? loc.longitude;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {};
}

const point = (city: City) => `POINT(${city.lng} ${city.lat})`;

export async function searchArtists(name: string, take = 5) {
  const response = await qloo.search({ query: name, types: "urn:entity:artist", take });
  return response.results.map((e) => ({
    qlooId: e.entity_id,
    name: e.name,
    disambiguation: e.disambiguation,
    popularity: round(e.popularity),
    imageUrl: e.properties?.image?.url,
  }));
}

export async function similarArtists(artistId: string, take = 10) {
  const response = await qloo.insights({
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": artistId,
    take,
  });
  return (response.results.entities ?? []).map(summarize);
}

const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "24 and under",
  "25_to_29": "25-29",
  "30_to_34": "30-34",
  "35_to_44": "35-44",
  "45_to_54": "45-54",
  "55_and_older": "55+",
};

/** Audience lean by age and gender. Scores run about -1..1; positive = above average. */
export async function audienceProfile(artistId: string) {
  const response = await qloo.insights({
    "filter.type": "urn:demographics",
    "signal.interests.entities": artistId,
  });
  const block = response.results.demographics?.[0]?.query;
  return {
    age: Object.entries(block?.age ?? {}).map(([bucket, score]) => ({
      bucket: AGE_LABELS[bucket] ?? bucket,
      score: round(score),
    })),
    gender: Object.entries(block?.gender ?? {}).map(([gender, score]) => ({ gender, score: round(score) })),
  };
}

function heatmapCoords(p: QlooHeatmapPoint) {
  const lat = p.location?.latitude ?? p.lat;
  const lng = p.location?.longitude ?? p.lon;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined;
}

export type Hotspot = City & { score: number; hotPoints: number; peakAffinity: number };

/**
 * Where the artist's taste audience is concentrated inside a region: one Qloo
 * heatmap call over the region, with each hot point matched to the nearest
 * known city (within 80 km).
 */
export async function audienceHotspots(artistId: string, region: Region, take = 12): Promise<Hotspot[]> {
  const response = await qloo.insights({
    "filter.type": "urn:heatmap",
    "signal.interests.entities": artistId,
    "filter.location": regionPolygon(region),
  });

  const byCity = new Map<string, { city: City; affinities: number[] }>();
  for (const p of response.results.heatmap ?? []) {
    const at = heatmapCoords(p);
    const affinity = p.query?.affinity;
    if (!at || typeof affinity !== "number") continue;

    let nearest: City | undefined;
    let best = 80;
    for (const city of region.cities) {
      const d = distanceKm({ name: "", ...at }, { ...city });
      if (d < best) {
        best = d;
        nearest = city;
      }
    }
    if (!nearest) continue;
    const entry = byCity.get(nearest.name) ?? { city: nearest, affinities: [] };
    entry.affinities.push(affinity);
    byCity.set(nearest.name, entry);
  }

  return [...byCity.values()]
    .map(({ city, affinities }) => {
      const peak = Math.max(...affinities);
      const mean = affinities.reduce((a, b) => a + b, 0) / affinities.length;
      // Peak matters most; more hot points around a city adds a little.
      const score = Math.min(1, 0.7 * peak + 0.3 * mean + 0.02 * (affinities.length - 1));
      return { ...city, score: round(score)!, hotPoints: affinities.length, peakAffinity: round(peak)! };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take);
}

// Place tags for rooms that host gigs. Without them Qloo also returns parks,
// landmarks and cafes. A comma list in filter.tags matches any of them.
const VENUE_TAGS = [
  "urn:tag:genre:place:live_music_venue",
  "urn:tag:genre:place:concert_hall",
  "urn:tag:genre:place:night_club",
  "urn:tag:category:place:live_music_bar",
];

/** Music venues near the city whose crowd matches the artist's audience. */
export async function venuesNear(artistId: string, city: City, take = 6): Promise<PlaceSummary[]> {
  const response = await qloo.insights({
    "filter.type": "urn:entity:place",
    "filter.tags": VENUE_TAGS,
    "signal.interests.entities": artistId,
    "filter.location": point(city),
    "filter.location.radius": 15000,
    take,
  });
  return (response.results.entities ?? []).map((e) => ({
    ...summarize(e),
    ...coords(e),
    address: e.properties?.address,
    rating: e.properties?.business_rating,
  }));
}

/** Artists that share this audience, biased to the city: support-act candidates. */
export async function localArtists(artistId: string, city: City, take = 5) {
  const response = await qloo.insights({
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": artistId,
    "signal.location": point(city),
    "filter.exclude.entities": artistId,
    take,
  });
  return (response.results.entities ?? []).map(summarize);
}

/** Brands the audience likes, biased to the city: sponsor and merch partners. */
export async function brandsNear(artistId: string, city: City, take = 5) {
  const response = await qloo.insights({
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": artistId,
    "signal.location": point(city),
    take,
  });
  return (response.results.entities ?? []).map(summarize);
}

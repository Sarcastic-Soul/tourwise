// Qloo API shapes, from the OpenAPI spec pinned by @qloo/qloo-harness and the
// docs.qloo.com recipes. Fields the docs disagree on are optional on purpose.

export type QlooParams = Record<string, string | number | boolean | string[] | undefined>;

export interface QlooEntity {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  types?: string[];
  popularity?: number;
  disambiguation?: string;
  properties?: {
    description?: string;
    short_description?: string;
    image?: { url?: string };
    address?: string;
    price_level?: number;
    business_rating?: number;
    geocode?: {
      name?: string;
      city?: string;
      metro?: string;
      admin1_region?: string;
      country_code?: string;
    };
    websites?: string[];
    [key: string]: unknown;
  };
  location?: { lat?: number; lon?: number; lng?: number; latitude?: number; longitude?: number };
  tags?: { id?: string; tag_id?: string; name: string; type?: string }[];
  query?: {
    affinity?: number | null;
    distance?: number | null;
    measurements?: { audience_growth?: number };
    explainability?: unknown;
  };
}

export interface QlooHeatmapPoint {
  // Docs show `location.{latitude,longitude,geohash}`; the spec shows flat lat/lon.
  location?: { latitude?: number; longitude?: number; geohash?: string };
  lat?: number;
  lon?: number;
  query?: { affinity?: number; affinity_rank?: number; popularity?: number };
}

export interface QlooDemographics {
  entity_id: string;
  query: {
    age?: Record<string, number>;
    gender?: Record<string, number>;
  };
}

export interface QlooTag {
  id?: string;
  tag_id?: string;
  name: string;
  type?: string;
  subtype?: string;
}

export interface QlooInsightsResponse {
  success: boolean;
  results: {
    entities?: QlooEntity[];
    heatmap?: QlooHeatmapPoint[];
    demographics?: QlooDemographics[];
    tags?: QlooTag[];
  };
  query?: Record<string, unknown>;
  duration?: number;
}

export interface QlooSearchResponse {
  success?: boolean;
  results: QlooEntity[];
  duration?: number;
}

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

/** Thrown when the app's own daily cap on live Qloo calls is used up. */
export class QlooLimitError extends QlooError {
  constructor() {
    super("Today's Qloo budget for this demo is used up. Saved plans still open; new plans start again tomorrow (UTC).", 429);
    this.name = "QlooLimitError";
  }
}

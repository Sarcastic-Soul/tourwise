"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FitBoundsOptions, GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Region } from "@/lib/regions";
import type { Hotspot } from "@/lib/run-view";

export type MapStop = { city: string; lat: number; lng: number };

type Props = {
  region: Region;
  hotspots: Hotspot[];
  scouted: Map<string, "running" | "done">;
  stops: MapStop[];
  /** Zoom to the stops once the route is final. */
  fitToStops: boolean;
};

type Colors = { accent: string; ink: string; paper: string };

// Copied into /public on install (scripts/copy-map-worker.mjs).
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

const emptyCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Same values as globals.css, used if the CSS variables can't be read yet.
const FALLBACK: Record<"light" | "dark", Colors> = {
  light: { accent: "#c93a17", ink: "#1d1a16", paper: "#f3ede2" },
  dark: { accent: "#e8582f", ink: "#eee6d8", paper: "#1b1916" },
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readColors(dark: boolean): Colors {
  const css = getComputedStyle(document.documentElement);
  const fallback = FALLBACK[dark ? "dark" : "light"];
  const get = (name: keyof Colors) => css.getPropertyValue(`--${name}`).trim() || fallback[name];
  return { accent: get("accent"), ink: get("ink"), paper: get("paper") };
}

/**
 * Region map. Shows every routable city, then grows rings where the Qloo
 * heatmap finds listeners, marks cities as the agent scouts them, and finally
 * draws the numbered route.
 */
export function RouteMap({ region, hotspots, scouted, stops, fitToStops }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const markerClass = useRef<typeof Marker | null>(null);
  const fittedTo = useRef("");
  // Last framing, reapplied without animation when the map changes size.
  const framing = useRef<[LngLatBoundsLike, FitBoundsOptions] | null>(null);
  const [ready, setReady] = useState(false);
  // Map tiles and paint colors follow the OS theme, so rebuild on a change.
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;

    import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        maplibre.setWorkerUrl(WORKER_URL);
        markerClass.current = maplibre.Marker;
        const colors = readColors(dark);

        const map = new maplibre.Map({
          container: container.current,
          style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`,
          bounds: region.bbox,
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        mapRef.current = map;
        map.on("resize", () => {
          if (framing.current) map.fitBounds(framing.current[0], { ...framing.current[1], duration: 0 });
        });

        map.on("load", () => {
          // Start with the credits folded into the (i) button; it covers the map on phones.
          container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          map.addSource("cities", { type: "geojson", data: emptyCollection });
          map.addSource("route", { type: "geojson", data: emptyCollection });

          map.addLayer({
            id: "audience",
            type: "circle",
            source: "cities",
            filter: [">", ["get", "score"], 0],
            paint: {
              "circle-color": colors.accent,
              "circle-opacity": 0.2,
              "circle-radius": ["interpolate", ["linear"], ["get", "score"], 0, 6, 1, 30],
              "circle-stroke-color": colors.accent,
              "circle-stroke-width": 1.5,
              "circle-stroke-opacity": 0.7,
            },
          });
          map.addLayer({
            id: "city-dots",
            type: "circle",
            source: "cities",
            paint: {
              "circle-radius": ["match", ["get", "state"], "scouting", 7, "scouted", 6, 3.5],
              "circle-color": ["match", ["get", "state"], "scouting", colors.paper, "scouted", colors.accent, colors.ink],
              "circle-stroke-color": ["match", ["get", "state"], "idle", colors.paper, colors.ink],
              "circle-stroke-width": ["match", ["get", "state"], "idle", 1, 2],
            },
          });
          map.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": colors.ink, "line-width": 6 },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": colors.accent, "line-width": 3.5 },
          });
          setReady(true);
        });
      })
      .catch(() => {
        // No map (old browser or blocked script). The framed paper grid stays.
      });

    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      fittedTo.current = "";
      framing.current = null;
      setReady(false);
    };
    // The map is built once per theme; region changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const scores = new Map(hotspots.map((h) => [h.name, h.score]));
    const stopNames = new Set(stops.map((s) => s.city));
    (map.getSource("cities") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: region.cities
        .filter((city) => !stopNames.has(city.name))
        .map((city) => {
          const scout = scouted.get(city.name);
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [city.lng, city.lat] },
            properties: {
              name: city.name,
              score: scores.get(city.name) ?? 0,
              state: scout === "running" ? "scouting" : scout === "done" ? "scouted" : "idle",
            },
          };
        }),
    });

    (map.getSource("route") as GeoJSONSource).setData(
      stops.length > 1
        ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops.map((s) => [s.lng, s.lat]) } }
        : emptyCollection,
    );

    markers.current.forEach((m) => m.remove());
    const MarkerClass = markerClass.current;
    markers.current = MarkerClass
      ? stops.map((stop, i) => {
          const el = document.createElement("div");
          el.className = "stop-marker";
          el.textContent = String(i + 1);
          el.title = stop.city;
          return new MarkerClass({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
        })
      : [];

    // Frame the stops once the route is final, otherwise the whole region.
    const target = fitToStops && stops.length > 1 ? `stops:${stops.map((s) => s.city).join("|")}` : `region:${region.id}`;
    if (fittedTo.current !== target) {
      fittedTo.current = target;
      if (target.startsWith("stops:")) {
        const lngs = stops.map((s) => s.lng);
        const lats = stops.map((s) => s.lat);
        framing.current = [
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 64, maxZoom: 7 },
        ];
      } else {
        framing.current = [region.bbox, { padding: 40 }];
      }
      map.fitBounds(framing.current[0], { ...framing.current[1], duration: target.startsWith("stops:") ? 900 : 600 });
    }
  }, [ready, region, hotspots, scouted, stops, fitToStops]);

  return (
    <div
      ref={container}
      className="h-[300px] border-[3px] border-ink bg-paper-deep sm:h-[380px] lg:h-[min(76vh,740px)] [&_canvas]:saturate-[.75]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0 39px, var(--line-soft) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, var(--line-soft) 39px 40px)",
      }}
    />
  );
}

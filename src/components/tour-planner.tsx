"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowRightIcon, GlobeHemisphereEastIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TourAgentUIMessage } from "@/lib/agent/tour-agent";
import type { TourPlan } from "@/lib/agent/plan-schema";
import { distanceKm } from "@/lib/geo";
import { getRegion, REGIONS, type Region } from "@/lib/regions";
import { deriveRun } from "@/lib/run-view";
import { AgentLog, SavedBar } from "./agent-log";
import { ArtistField, type Artist } from "./artist-field";
import { RouteMap, type MapStop } from "./route-map";
import { IntroPoster, PlanNotes, PlanPoster } from "./tour-poster";

type PlanRequest = { artist: { qlooId: string; name: string }; regionId: string; stops: number };
type Run = { artist: Artist; region: Region; stops: number; startedAt: number };
type Saved = { plan: TourPlan; createdAt: string };

/** Form values (and a saved plan) from a shared link, read on the server. */
export type Initial = { artist: Artist; regionId: string; stops: number; saved: Saved | null };

const STOP_OPTIONS = [3, 4, 5, 6, 7, 8];

// The request body comes from sendMessage's options, so the server gets the
// plan request instead of a chat history.
const transport = new DefaultChatTransport<TourAgentUIMessage>({
  api: "/api/plan",
  prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
});

function readError(error: Error) {
  try {
    const body = JSON.parse(error.message);
    if (typeof body?.error === "string") return body.error;
  } catch {
    // Not JSON: the stream's own error text.
  }
  const text = error.message?.trim();
  return text && text.length < 240 && !text.startsWith("<") ? text : "Something went wrong. Please try again.";
}

function syncUrl(artist: Artist, regionId: string, stops: number) {
  const params = new URLSearchParams({ artist: artist.qlooId, name: artist.name, region: regionId, stops: String(stops) });
  window.history.replaceState(null, "", `?${params}`);
}

async function fetchSaved(request: PlanRequest): Promise<Saved | null> {
  const params = new URLSearchParams({
    artistId: request.artist.qlooId,
    regionId: request.regionId,
    stops: String(request.stops),
  });
  const response = await fetch(`/api/plan?${params}`);
  if (!response.ok) return null;
  const body = await response.json();
  return body.plan ? body : null;
}

export function TourPlanner({ demoData, initial }: { demoData: boolean; initial?: Initial }) {
  const [artist, setArtist] = useState<Artist | null>(initial?.artist ?? null);
  const [regionId, setRegionId] = useState(initial?.regionId ?? REGIONS[0].id);
  const [stops, setStops] = useState(initial?.stops ?? 5);
  const [formError, setFormError] = useState<string | null>(null);
  const candidates = useRef<Artist[]>([]);
  const onResults = useCallback((artists: Artist[]) => {
    candidates.current = artists;
  }, []);

  const [run, setRun] = useState<Run | null>(() => {
    const region = initial?.saved ? getRegion(initial.regionId) : undefined;
    return initial && region ? { artist: initial.artist, region, stops: initial.stops, startedAt: 0 } : null;
  });
  const [saved, setSaved] = useState<Saved | null>(initial?.saved ?? null);
  const [now, setNow] = useState(0);

  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat<TourAgentUIMessage>({
    id: "tour-plan",
    transport,
  });
  const active = status === "submitted" || status === "streaming";

  const region = getRegion(regionId) ?? REGIONS[0];
  const shownRegion = run?.region ?? region;

  // Live clock for the run timer. It stops ticking when the run ends, which
  // freezes the shown time.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [active]);

  async function plan(force: boolean) {
    const chosen = artist ?? candidates.current[0] ?? null;
    if (!chosen) {
      setFormError("Search for an artist and pick one from the list.");
      return;
    }
    setFormError(null);
    setArtist(chosen);
    syncUrl(chosen, region.id, stops);

    const next: PlanRequest = { artist: { qlooId: chosen.qlooId, name: chosen.name }, regionId: region.id, stops };
    if (!force) {
      const found = await fetchSaved(next).catch(() => null);
      if (found) {
        clearError();
        setMessages([]);
        setSaved(found);
        setRun({ artist: chosen, region, stops, startedAt: 0 });
        return;
      }
    }

    clearError();
    setMessages([]);
    setSaved(null);
    const startedAt = Date.now();
    setNow(startedAt);
    setRun({ artist: chosen, region, stops, startedAt });
    sendMessage({ text: `Plan a ${stops}-stop ${region.label} tour for ${chosen.name}.` }, { body: next });
  }

  const view = useMemo(
    () => deriveRun(messages, { regionLabel: shownRegion.label, active }),
    [messages, shownRegion.label, active],
  );

  const shownPlan = saved?.plan ?? view.plan;
  const planDone = Boolean(saved) || view.planDone;
  const stoppedWithoutPlan = Boolean(run) && !saved && !active && !error && !view.planDone && messages.length > 0;

  // Stops with our own coordinates, in plan order.
  const mapStops = useMemo<MapStop[]>(() => {
    const cities = new Map(shownRegion.cities.map((c) => [c.name.toLowerCase(), c]));
    return (shownPlan?.stops ?? []).flatMap((s) => {
      const city = s?.city ? cities.get(s.city.toLowerCase()) : undefined;
      return city ? [{ city: city.name, lat: city.lat, lng: city.lng }] : [];
    });
  }, [shownPlan, shownRegion]);

  const legsKm = mapStops.slice(1).map((s, i) => Math.round(distanceKm({ name: "", ...mapStops[i] }, { name: "", ...s })));
  const totalKm = legsKm.reduce((sum, km) => sum + km, 0);
  const seconds = run && now > run.startedAt ? (now - run.startedAt) / 1000 : 0;

  return (
    <div className="mx-auto max-w-[1360px] px-4 sm:px-10">
      <header className="grid grid-cols-1 items-end gap-x-10 gap-y-2 border-b-[3px] border-ink pt-7 pb-5.5 md:grid-cols-[auto_minmax(0,1fr)]">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[30px] leading-none font-extrabold tracking-[-0.02em]">
          <span aria-hidden className="inline-block size-3.5 rounded-full bg-accent" />
          Tourwise
        </Link>
        <p className="max-w-[52ch] text-muted">
          Tour routing for independent artists, built on Qloo taste data.
        </p>

        <form
          className="relative mt-4.5 grid grid-cols-[minmax(0,1fr)_96px] border-2 border-ink bg-paper md:col-span-2 md:grid-cols-[minmax(0,2.2fr)_minmax(13rem,1.2fr)_96px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!active) plan(false);
          }}
        >
          <div className="col-span-2 md:col-span-1">
            <ArtistField
              value={artist}
              onChange={(a) => {
                setArtist(a);
                if (a) setFormError(null);
              }}
              onResults={onResults}
              invalid={Boolean(formError)}
            />
          </div>
          <Field label="Region" htmlFor="region" className="border-r-2">
            <div className="flex items-center gap-2">
              <GlobeHemisphereEastIcon weight="bold" aria-hidden className="flex-none text-lg text-muted" />
              <select
                id="region"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pt-0.5 text-[19px] leading-snug font-semibold outline-none"
              >
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Stops" htmlFor="stops" className="md:border-r-2">
            <select
              id="stops"
              value={stops}
              onChange={(e) => setStops(Number(e.target.value))}
              className="w-full cursor-pointer appearance-none bg-transparent pt-0.5 text-[19px] leading-snug font-semibold outline-none"
            >
              {STOP_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={active}
            className="col-span-2 flex items-center justify-center gap-2.5 bg-accent px-7 py-4 font-display text-lg leading-none font-bold whitespace-nowrap text-on-accent transition-[background-color,transform] duration-150 ease-out hover:bg-accent-strong focus-visible:outline-ink active:translate-y-px disabled:cursor-progress disabled:opacity-70 md:col-span-1 md:py-0"
          >
            {active ? "Planning" : "Plan tour"}
            <ArrowRightIcon weight="bold" aria-hidden />
          </button>
        </form>
        {formError && (
          <p role="alert" className="text-sm font-medium text-accent md:col-span-2">
            {formError}
          </p>
        )}
      </header>

      {saved ? (
        <SavedBar createdAt={saved.createdAt} onReplan={() => plan(true)} />
      ) : (
        run && <AgentLog steps={view.steps} seconds={seconds} active={active} onStop={stop} />
      )}

      {(error || stoppedWithoutPlan) && (
        <div role="alert" className="mt-6 flex flex-wrap items-start gap-3 border-2 border-accent px-4 py-3">
          <WarningCircleIcon weight="bold" aria-hidden className="mt-0.5 flex-none text-xl text-accent" />
          <p className="min-w-0 flex-1">
            <b className="font-semibold">{error ? readError(error) : "The agent stopped before finishing a plan."}</b>
            {!error && view.note && <span className="block text-sm text-ink-soft">{view.note}</span>}
          </p>
          <button
            type="button"
            onClick={() => plan(true)}
            className="border border-ink px-3 py-1 text-sm font-semibold transition-colors pointer-coarse:min-h-11 hover:bg-ink hover:text-paper"
          >
            Try again
          </button>
        </div>
      )}

      <main className="grid grid-cols-1 gap-x-12 pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="order-2 lg:order-1">
          {run ? (
            <PlanPoster
              artistName={run.artist.name}
              region={run.region}
              stopCount={run.stops}
              plan={shownPlan}
              legsKm={legsKm}
              totalKm={totalKm}
              done={planDone}
              working={active}
            />
          ) : (
            <IntroPoster />
          )}
        </div>

        <aside aria-label="Route map" className="relative order-1 mb-8 lg:order-2 lg:mb-0">
          <div className="relative lg:sticky lg:top-6">
            <Stamp
              big={run ? String(planDone ? mapStops.length : run.stops) : String(shownRegion.cities.length)}
              lines={
                run
                  ? ["stops", planDone ? `${totalKm.toLocaleString("en")} km` : active ? "planning" : "stopped"]
                  : ["cities", "to route"]
              }
            />
            <div role="img" aria-label={mapLabel(shownRegion, mapStops)}>
              <RouteMap
                region={shownRegion}
                hotspots={saved ? [] : view.hotspots}
                scouted={saved ? EMPTY_SCOUTED : view.scouted}
                stops={mapStops}
                fitToStops={planDone}
              />
            </div>
            <MapCaption run={Boolean(run)} planDone={planDone} stops={mapStops} hotspots={view.hotspots.length} />
          </div>
        </aside>
      </main>

      {planDone && shownPlan && <PlanNotes plan={shownPlan as TourPlan} />}

      <footer className="mt-14 flex flex-wrap justify-between gap-4 border-t border-ink pt-4 pb-8 text-xs text-muted">
        <span>
          {demoData
            ? "Demo data: the Qloo key is not set, so names and scores are made up."
            : "Qloo results are aggregate taste signals, not facts about individual fans."}
        </span>
        <span>Taste data by Qloo. Agent on Gemini Flash Lite with a Mistral fallback.</span>
      </footer>
    </div>
  );
}

const EMPTY_SCOUTED = new Map<string, "running" | "done">();

function mapLabel(region: Region, stops: MapStop[]) {
  return stops.length
    ? `Map of the route: ${stops.map((s) => s.city).join(", ")}`
    : `Map of ${region.label} with the cities Tourwise can route through`;
}

function MapCaption({
  run,
  planDone,
  stops,
  hotspots,
}: {
  run: boolean;
  planDone: boolean;
  stops: MapStop[];
  hotspots: number;
}) {
  let text = "Dots are the cities Tourwise can route through.";
  if (run && planDone && stops.length) text = stops.map((s) => s.city).join(" → ");
  else if (run && hotspots) text = "Rings show where the audience is. Filled dots are scouted cities.";
  else if (run) text = "Waiting for the Qloo heatmap.";
  return (
    <div className="flex flex-wrap justify-between gap-x-4 pt-2 text-xs text-muted">
      <span>{text}</span>
      <span>Map: OpenFreeMap, OpenStreetMap</span>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col border-ink px-3.5 pt-2.5 pb-2 focus-within:bg-paper-deep ${className}`}>
      <label htmlFor={htmlFor} className="text-[11px] font-semibold tracking-[.08em] text-muted uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The round stamp that breaks out of the map's corner. */
function Stamp({ big, lines }: { big: string; lines: string[] }) {
  const reduce = useReducedMotion();
  const key = `${big}-${lines.join("-")}`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-6 right-3 z-10 size-24 sm:size-[116px] lg:-top-8 lg:right-auto lg:-left-14 lg:size-[148px]"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { scale: 0.8, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: -12, opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.45 }}
          className="grid size-full place-items-center rounded-full bg-accent text-center font-display text-on-accent shadow-[0_0_0_6px_var(--paper)]"
        >
          <div>
            <b className="block text-2xl leading-[.9] font-extrabold tracking-[-0.03em] tabular-nums sm:text-3xl lg:text-[40px]">
              {big}
            </b>
            {lines.map((line) => (
              <span key={line} className="block text-[10px] font-bold tracking-[.12em] uppercase lg:text-xs">
                {line}
              </span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

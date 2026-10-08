"use client";

import {
  ArrowDownIcon,
  ChartBarIcon,
  DoorOpenIcon,
  GuitarIcon,
  HandshakeIcon,
} from "@phosphor-icons/react";
import type { DeepPartial } from "ai";
import { motion, useReducedMotion } from "motion/react";
import type { TourPlan, TourStop } from "@/lib/agent/plan-schema";
import type { Region } from "@/lib/regions";

type PartialPlan = DeepPartial<TourPlan>;
type PartialStop = DeepPartial<TourStop>;

const HOW_IT_WORKS = [
  ["Map the audience", "A Qloo heatmap shows where people with this artist's taste are concentrated."],
  ["Scout each city", "Venues, local acts and brands that the same audience likes, city by city."],
  ["Route the tour", "Stops are put in the order that keeps total travel shortest."],
  ["Show the evidence", "Every pick lists the Qloo signal behind it, so you can check it."],
] as const;

/** Empty state: what the tool does, before any plan. */
export function IntroPoster() {
  return (
    <div className="pb-2">
      <h1 className="font-display text-[clamp(46px,6.4vw,100px)] leading-[.88] font-extrabold tracking-[-0.045em] uppercase">
        Tour where your listeners
        <span className="block text-accent">already are.</span>
      </h1>
      <p className="mt-6 max-w-[46ch] font-display text-[22px] leading-tight font-semibold tracking-[-0.01em]">
        Pick an artist and a region. Tourwise reads Qloo taste data to find the cities, rooms, openers and
        sponsors that fit their audience.
      </p>

      <h2 className="mt-12 border-t-[3px] border-ink pt-4 font-display text-xl font-extrabold tracking-[-0.01em] uppercase">
        How a plan gets made
      </h2>
      <ol className="mt-2">
        {HOW_IT_WORKS.map(([title, text], i) => (
          <li key={title} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-3 border-b border-line-soft py-4">
            <span className="grid size-10 place-items-center rounded-full border-2 border-ink font-display text-lg font-extrabold">
              {i + 1}
            </span>
            <div>
              <b className="block font-display text-[19px] font-bold tracking-[-0.01em]">{title}</b>
              <span className="text-ink-soft">{text}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type PlanPosterProps = {
  artistName: string;
  region: Region;
  stopCount: number;
  plan: PartialPlan | undefined;
  /** Distance of each leg, aligned with the plan's stops. */
  legsKm: number[];
  totalKm: number;
  done: boolean;
  /** The agent is still running, so missing parts show as loading. */
  working: boolean;
};

const year = `’${String(new Date().getFullYear()).slice(2)}`;

/** The plan as a gig poster: artist billing, then one entry per date. */
export function PlanPoster({ artistName, region, stopCount, plan, legsKm, totalKm, done, working }: PlanPosterProps) {
  const stops = (plan?.stops ?? []).filter((s): s is PartialStop => Boolean(s?.city));
  const placeholders = working && !done ? Math.max(0, stopCount - stops.length) : 0;
  const topScore = stops.reduce((max, s) => Math.max(max, s.audienceScore ?? 0), 0);
  const longName = artistName.length > 16;

  return (
    <div className="pb-2">
      <p className="mb-1.5 text-[13px] font-semibold tracking-[.12em] text-muted uppercase">
        {region.label} tour plan for
      </p>
      <h1
        className={`font-display leading-[.86] font-extrabold tracking-[-0.045em] break-words uppercase ${
          longName ? "text-[clamp(42px,6vw,92px)]" : "text-[clamp(54px,8.4vw,124px)]"
        }`}
      >
        {artistName}
        <span className="block text-accent">
          {region.label} {year}
        </span>
      </h1>

      {plan?.headline ? (
        <p className="mt-6 max-w-[34ch] font-display text-[22px] leading-tight font-semibold tracking-[-0.01em]">
          {plan.headline}
        </p>
      ) : (
        working && <Skeleton lines={2} className="mt-7 max-w-[30ch]" tall />
      )}
      {plan?.audienceSummary ? (
        <p className="mt-3.5 max-w-[60ch] text-ink-soft">{plan.audienceSummary}</p>
      ) : (
        working && <Skeleton lines={3} className="mt-4 max-w-[56ch]" />
      )}

      <dl className="mt-5 flex flex-wrap gap-7">
        <Stat label="Stops" value={stops.length ? String(stops.length) : "-"} />
        <Stat label="Distance" value={done && totalKm ? `${totalKm.toLocaleString("en")} km` : "-"} />
        <Stat label="Top city score" value={topScore ? topScore.toFixed(3) : "-"} />
      </dl>

      <ol className="mt-10 border-t-[3px] border-ink" aria-busy={!done}>
        {stops.map((stop, i) => (
          <StopEntry
            key={`${i}-${stop.city}`}
            index={i}
            stop={stop}
            nextCity={stops[i + 1]?.city}
            legKm={done ? legsKm[i] : undefined}
          />
        ))}
        {Array.from({ length: placeholders }, (_, i) => (
          <StopPlaceholder key={`placeholder-${i}`} number={stops.length + i + 1} />
        ))}
      </ol>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] border-t-2 border-ink pt-1.5">
      <dt className="text-[11px] font-semibold tracking-[.08em] text-muted uppercase">{label}</dt>
      <dd className="font-display text-[26px] font-bold tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

function StopEntry({
  index,
  stop,
  nextCity,
  legKm,
}: {
  index: number;
  stop: PartialStop;
  nextCity: string | undefined;
  legKm: number | undefined;
}) {
  const reduce = useReducedMotion();
  const score = stop.audienceScore ?? 0;
  const brands = (stop.sponsorBrands ?? []).flatMap((b) => (b?.name ? [b.name] : []));
  const evidence = (stop.evidence ?? []).filter((e): e is string => Boolean(e));

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1], delay: reduce ? 0 : Math.min(index, 6) * 0.05 }}
      className="grid grid-cols-1 border-b border-ink pt-5 pb-6 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-x-4"
    >
      <span
        aria-hidden
        className="mb-2.5 grid size-[38px] place-items-center rounded-full border-2 border-ink font-display text-lg font-extrabold sm:mt-1.5 sm:mb-0 sm:size-[46px] sm:text-[22px]"
      >
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex flex-col items-start gap-3">
          <h2 className="font-display text-[clamp(40px,5.6vw,76px)] leading-[.9] font-extrabold tracking-[-0.04em] break-words uppercase">
            <span className="sr-only">Stop {index + 1}: </span>
            {stop.city}{" "}
            {stop.country && (
              <small className="ml-2.5 align-[.9em] text-[15px] font-semibold tracking-[.1em] text-muted">
                {stop.country}
              </small>
            )}
          </h2>
          {score > 0 && (
            <div className="flex items-center gap-2.5 tabular-nums">
              <span className="text-[11px] font-semibold tracking-[.08em] text-muted uppercase">Audience</span>
              <span aria-hidden className="relative h-2.5 w-20 border-[1.5px] border-ink sm:w-[120px]">
                <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${Math.round(score * 100)}%` }} />
              </span>
              <strong className="font-display text-xl font-bold">{score.toFixed(3)}</strong>
            </div>
          )}
        </div>

        {stop.why && <p className="mt-3 max-w-[62ch] text-ink-soft">{stop.why}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
          <Detail icon={<DoorOpenIcon weight="bold" />} label="Venue" name={stop.venue?.name} why={stop.venue?.why} />
          <Detail
            icon={<GuitarIcon weight="bold" />}
            label="Support act"
            name={stop.supportAct?.name}
            why={stop.supportAct?.why}
          />
          <div className="col-span-2 md:col-span-1">
            <DetailLabel icon={<HandshakeIcon weight="bold" />} label="Sponsor brands" />
            <dd className="mt-0.5 font-medium">{brands.length ? brands.join(", ") : <None />}</dd>
          </div>
        </dl>

        {evidence.length > 0 && (
          <ul className="mt-3.5 space-y-1 border-t border-dashed border-line-soft pt-2.5 text-[13px] text-ink-soft">
            {evidence.map((line) => (
              <li key={line} className="flex items-baseline gap-2">
                <ChartBarIcon weight="bold" aria-hidden className="flex-none translate-y-0.5 text-accent" />
                {line}
              </li>
            ))}
          </ul>
        )}

        {legKm !== undefined && nextCity && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <ArrowDownIcon weight="bold" aria-hidden />
            {legKm.toLocaleString("en")} km to {nextCity}
          </p>
        )}
      </div>
    </motion.li>
  );
}

function DetailLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[.08em] text-muted uppercase">
      <span aria-hidden>{icon}</span>
      {label}
    </dt>
  );
}

function Detail({ icon, label, name, why }: { icon: React.ReactNode; label: string; name?: string; why?: string }) {
  return (
    <div>
      <DetailLabel icon={icon} label={label} />
      <dd className="mt-0.5">
        {name ? <span className="block text-base font-semibold">{name}</span> : <None />}
        {name && why && <span className="mt-0.5 block text-xs leading-snug text-muted">{why}</span>}
      </dd>
    </div>
  );
}

function None() {
  return <span className="text-muted">No strong match</span>;
}

function StopPlaceholder({ number }: { number: number }) {
  return (
    <li
      aria-hidden
      className="grid grid-cols-1 border-b border-ink pt-5 pb-6 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-x-4"
    >
      <span className="mb-2.5 grid size-[38px] place-items-center rounded-full border-2 border-line-soft font-display text-lg font-extrabold text-muted sm:mt-1.5 sm:mb-0 sm:size-[46px] sm:text-[22px]">
        {number}
      </span>
      <div>
        <div className="h-[clamp(36px,5vw,64px)] w-3/5 bg-ink/8 motion-safe:animate-pulse" />
        <Skeleton lines={2} className="mt-5 max-w-[48ch]" />
      </div>
    </li>
  );
}

function Skeleton({ lines, className = "", tall = false }: { lines: number; className?: string; tall?: boolean }) {
  return (
    <div aria-hidden className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`${tall ? "h-5" : "h-3.5"} bg-ink/8 motion-safe:animate-pulse`}
          style={{ width: i === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** Cities left out and data limits, under the poster. */
export function PlanNotes({ plan }: { plan: TourPlan }) {
  if (!plan.skippedCities.length && !plan.caveats.length) return null;
  return (
    <section className="mt-14 grid grid-cols-1 gap-10 border-t-[3px] border-ink pt-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div>
        <h2 className="mb-2.5 font-display text-xl font-extrabold tracking-[-0.01em] uppercase">Left off the bill</h2>
        {plan.skippedCities.length ? (
          <ul>
            {plan.skippedCities.map((s) => (
              <li
                key={s.city}
                className="grid grid-cols-1 gap-0.5 border-b border-line-soft py-2.5 text-sm sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3.5"
              >
                <b className="font-display text-lg font-bold line-through decoration-accent decoration-2">{s.city}</b>
                <span className="text-ink-soft">{s.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Every strong city made the route.</p>
        )}
      </div>
      {plan.caveats.length > 0 && (
        <div>
          <h2 className="mb-2.5 font-display text-xl font-extrabold tracking-[-0.01em] uppercase">Read before booking</h2>
          <ul className="list-disc space-y-2 pl-4.5 text-sm text-ink-soft marker:text-accent">
            {plan.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

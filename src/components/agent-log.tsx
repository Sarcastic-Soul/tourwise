"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  ListChecksIcon,
  StopIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Step } from "@/lib/run-view";

const ICONS = {
  waiting: <CircleIcon weight="bold" className="text-muted" />,
  running: <CircleNotchIcon weight="bold" className="text-accent motion-safe:animate-spin" />,
  done: <CheckCircleIcon weight="bold" className="text-accent" />,
  error: <WarningCircleIcon weight="bold" className="text-accent" />,
};

const STATUS_TEXT = { waiting: "Waiting", running: "Working", done: "Done", error: "Stopped" };

export function AgentLog({
  steps,
  seconds,
  active,
  onStop,
}: {
  steps: Step[];
  seconds: number;
  active: boolean;
  onStop: () => void;
}) {
  return (
    <section
      aria-label="Agent steps"
      className="grid grid-cols-1 border-b border-ink text-[13px] sm:grid-cols-3 lg:grid-cols-[auto_repeat(5,minmax(0,1fr))]"
    >
      <div className="flex items-center gap-3 border-b border-ink py-3 font-display text-[13px] font-bold uppercase tracking-[.06em] sm:col-span-3 lg:col-span-1 lg:border-r lg:border-b-0 lg:pr-5">
        <ListChecksIcon weight="bold" aria-hidden className="text-base" />
        <span className="tabular-nums">
          Agent run {seconds.toFixed(1)}s
        </span>
        {active && (
          <button
            type="button"
            onClick={onStop}
            className="ml-auto inline-flex items-center gap-1 border border-ink px-2 py-0.5 font-sans text-xs pointer-coarse:min-h-11 font-semibold normal-case tracking-normal transition-colors hover:bg-ink hover:text-paper lg:ml-2"
          >
            <StopIcon weight="fill" aria-hidden />
            Stop
          </button>
        )}
      </div>
      <ol className="contents" aria-live="polite">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-2 border-b border-ink px-0 py-2.5 last:border-b-0 sm:border-r sm:px-3.5 sm:[&:nth-child(3n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(3n)]:border-r lg:last:border-r-0"
          >
            <span className="mt-0.5 flex-none text-base" aria-hidden>
              {ICONS[step.status]}
            </span>
            <div className="min-w-0">
              <b className={`block font-semibold ${step.status === "waiting" ? "text-muted" : ""}`}>
                {step.title}
                <span className="sr-only">: {STATUS_TEXT[step.status]}</span>
              </b>
              <span className="block truncate text-xs text-muted" title={step.detail}>
                {step.detail}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SavedBar({ createdAt, onReplan }: { createdAt: string; onReplan: () => void }) {
  const date = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <section
      aria-label="Saved plan"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink py-3 text-[13px]"
    >
      <span className="flex min-w-0 flex-1 items-start gap-2.5">
        <CheckCircleIcon weight="bold" aria-hidden className="mt-0.5 flex-none text-base text-accent" />
        <span>
          <b className="font-semibold">Saved plan from {date}.</b>{" "}
          <span className="text-muted">Opening it again makes no new Qloo calls.</span>
        </span>
      </span>
      <button
        type="button"
        onClick={onReplan}
        className="inline-flex items-center gap-1.5 border border-ink px-2.5 py-1 text-xs font-semibold pointer-coarse:min-h-11 transition-colors hover:bg-ink hover:text-paper sm:ml-auto"
      >
        <ArrowClockwiseIcon weight="bold" aria-hidden />
        Plan again
      </button>
    </section>
  );
}

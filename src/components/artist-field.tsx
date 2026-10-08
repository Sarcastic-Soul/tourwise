"use client";

import { CircleNotchIcon, MicrophoneStageIcon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";

export type Artist = { qlooId: string; name: string; disambiguation?: string };

type Props = {
  value: Artist | null;
  onChange: (artist: Artist | null) => void;
  /** Latest search results, so the form can use the top match on submit. */
  onResults: (artists: Artist[]) => void;
  invalid: boolean;
};

/** Artist search box backed by Qloo /search. Picks a Qloo id, not just a name. */
export function ArtistField({ value, onChange, onResults, invalid }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  // `query` is what the box shows; `term` is what was typed, and only typing
  // starts a search (picking a result fills the box without searching).
  const [query, setQuery] = useState(value?.name ?? "");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/artists?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Artist search failed.");
        setResults(body.artists);
        onResults(body.artists);
        setActive(0);
        setOpen(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Artist search failed.");
        setResults([]);
        onResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, onResults]);

  function type(text: string) {
    setQuery(text);
    setTerm(text);
    if (text.trim().length < 2) {
      setResults([]);
      onResults([]);
      setLoading(false);
    }
    if (value) onChange(null);
  }

  function choose(artist: Artist) {
    setQuery(artist.name);
    setOpen(false);
    onChange(artist);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && results.length > 0;

  return (
    <div className="relative flex min-w-0 flex-col border-b-2 border-ink px-3.5 pt-2.5 pb-2 focus-within:bg-paper-deep md:border-r-2 md:border-b-0">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
        Artist
      </label>
      <div className="flex items-center gap-2">
        <MicrophoneStageIcon weight="bold" aria-hidden className="flex-none text-lg text-muted" />
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search an artist"
          value={query}
          onChange={(e) => type(e.target.value)}
          onFocus={() => results.length && !value && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent pt-0.5 text-[19px] leading-snug font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted"
        />
        {loading && <CircleNotchIcon weight="bold" aria-label="Searching" className="flex-none text-muted motion-safe:animate-spin" />}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-accent">
          {error}
        </p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching artists"
          className="absolute top-full right-[-2px] left-[-2px] z-20 border-2 border-ink bg-paper shadow-[6px_6px_0_var(--ink)]"
        >
          {results.map((artist, i) => (
            <li
              key={artist.qlooId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(artist);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer border-b border-line-soft px-3.5 py-2.5 last:border-b-0 ${
                i === active ? "bg-paper-deep" : ""
              }`}
            >
              <span className="block font-semibold">{artist.name}</span>
              {artist.disambiguation && <span className="block text-xs text-muted">{artist.disambiguation}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

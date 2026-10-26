/* The live heartbeat (docs/BRIEF.md §4.7): a violet pulse dot and "Scanning live. Last scan 2s ago." Stale (no
 * confirming scan within the freshness limit) and paused (no scan in 60s, or upstream failure) turn it Steel and say
 * what happened. Pure: the caller passes the state and the seconds (components/landing/HeaderBeat keeps it live). */
export type BeatState = "live" | "stale" | "paused";

/** Freshness (docs/BRIEF.md §9): a scan older than this makes the data stale; older than PAUSED_AFTER_S, paused. */
export const STALE_AFTER_S = 20;
export const PAUSED_AFTER_S = 60;

export function beatState(live: boolean, agoS: number | null): BeatState {
  if (!live || agoS === null || agoS > PAUSED_AFTER_S) return "paused";
  return agoS > STALE_AFTER_S ? "stale" : "live";
}

export function beatText(state: BeatState, agoS: number | null): string {
  if (state === "paused") return "Live data paused. Retrying now.";
  if (state === "stale") return `Prices last checked ${agoS}s ago. Checking again.`;
  return `Scanning live. Last scan ${agoS ?? 0}s ago.`;
}

export function Heartbeat({ state, agoS, compact = false }: { state: BeatState; agoS: number | null; compact?: boolean }) {
  return (
    <p className={`beat beat--${state}${compact ? " beat--compact" : ""}`} role="status" aria-live="off">
      <span className="beat__dot" aria-hidden="true" />
      {compact && state === "live" ? <>Live<span className="beat__more"> · last scan <span className="mono">{agoS ?? 0}s</span> ago</span></> : beatText(state, agoS)}
    </p>
  );
}

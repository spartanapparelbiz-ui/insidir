"use client";
/* The Desk's top bar: "Live · updated Xs ago" (from the newest bet seen) and a live ET clock. */
import { useEffect, useState } from "react";

const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const since = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

/** "Live · checked 12s ago" while the worker polled within 5 minutes, else "Paused · last check 9m ago"; the newest
 *  bet is its own line ("Last bet 2h ago"), never folded into "Live". */
export const LIVE_MS = 5 * 60_000;
export function LivePulse({ updatedAt, polledAt, now: now0 }: { updatedAt: number | null; polledAt: number | null; now: number }) {
  const [now, setNow] = useState(now0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const live = polledAt !== null && now - polledAt < LIVE_MS;
  return (
    <span className="d-pulse" data-testid="desk-pulse" data-live={live}>
      <span className={live ? "d-live" : "d-live d-live--off"}><i aria-hidden="true" />{live ? <>Live · checked {since(now - polledAt!)} ago</> : polledAt ? <>Paused · last check {since(now - polledAt)} ago</> : <>Paused</>}</span>
      {updatedAt ? <span className="d-dim" data-testid="desk-last-bet">Last bet {since(now - updatedAt)} ago</span> : null}
    </span>
  );
}

export function EtClock({ now: now0 }: { now: number }) {
  const [now, setNow] = useState(now0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <time className="d-clock d-num" dateTime={new Date(now).toISOString()} suppressHydrationWarning>{ET.format(new Date(now))} ET</time>;
}

"use client";
/* The Desk's top bar: "Live · updated Xs ago" (from the newest bet seen) and a live ET clock. */
import { useEffect, useState } from "react";

const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const since = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

export function LivePulse({ updatedAt, now: now0 }: { updatedAt: number | null; now: number }) {
  const [now, setNow] = useState(now0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <span className="d-live" data-testid="desk-pulse"><i aria-hidden="true" />Live{updatedAt ? <> · updated <span className="d-num">{since(now - updatedAt)}</span> ago</> : null}</span>;
}

export function EtClock({ now: now0 }: { now: number }) {
  const [now, setNow] = useState(now0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <time className="d-clock d-num" dateTime={new Date(now).toISOString()} suppressHydrationWarning>{ET.format(new Date(now))} ET</time>;
}

"use client";
/* The top bar's live clock, Eastern time: "SUN 08 NOV 2026 · 23:52:14 ET". Rendered empty on the server and filled on
 * mount (no hydration mismatch), then every second. */
import { useEffect, useState } from "react";

const PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** "SUN 08 NOV 2026 · 23:52:14 ET". Pure. */
export function etClockText(ms: number): string {
  const p = PARTS.formatToParts(new Date(ms)), g = (k: string) => p.find(x => x.type === k)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")} ${g("year")} · ${g("hour")}:${g("minute")}:${g("second")} ET`.toUpperCase();
}

export function Clock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <time className="t-clock" data-testid="t-clock" dateTime={now ? new Date(now).toISOString() : undefined} suppressHydrationWarning>{now ? etClockText(now) : " "}</time>;
}

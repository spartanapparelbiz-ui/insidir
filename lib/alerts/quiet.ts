/* Quiet hours: no alerts between two local times, in the user's own time zone. Pure. A window may wrap midnight
 * (22:00–07:00). Equal start and end means no quiet hours. An account with no time zone yet (the browser sends it on
 * the first signed-in page, components/app/TimeZoneSync.tsx) runs on New York time, never UTC. */

/** Where Insidir's members are: the clock for an account whose browser hasn't told us its time zone yet. */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** "HH:MM" (24-hour) → minutes after midnight, or null when it isn't a valid time. */
export function minutesOf(t: string | null | undefined): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** True when `tz` is an IANA time zone this runtime knows. */
export function validTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** The account's time zone, or New York when it has none (or one this runtime doesn't know). */
export const zoneOf = (tz: string | null | undefined): string => (validTimeZone(tz) ? tz! : DEFAULT_TIME_ZONE);

/** Minutes after local midnight at `now` in `tz`. */
export function localMinutes(now: number, tz: string | null | undefined): number {
  const zone = zoneOf(tz);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0), m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}

/** Whether `now` falls inside the user's quiet hours [start, end). */
export function inQuietHours(now: number, start: string | null | undefined, end: string | null | undefined, tz: string | null | undefined): boolean {
  const s = minutesOf(start), e = minutesOf(end);
  if (s === null || e === null || s === e) return false;
  const t = localMinutes(now, tz);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** The start (ms) of the local day and of the local week (Monday) that `now` falls in, in `tz`. Pure. */
export function localDayAndWeekStart(now: number, tz: string | null | undefined): { day: number; week: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zoneOf(tz), hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const into = ((Number(get("hour")) % 24) * 3600 + Number(get("minute")) * 60 + Number(get("second"))) * 1000 + (now % 1000);
  const day = now - into, back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  // Hours, not calendar days, back to Monday: a daylight-saving change in between moves it by an hour at most.
  return { day, week: day - Math.max(0, back) * 86_400_000 };
}

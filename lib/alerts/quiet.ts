/* Quiet hours: no alerts between two local times, in the user's own time zone. Pure. A window may wrap midnight
 * (22:00–07:00). Equal start and end means no quiet hours. An unknown time zone falls back to UTC. */

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

/** Minutes after local midnight at `now` in `tz`. */
export function localMinutes(now: number, tz: string | null | undefined): number {
  const zone = validTimeZone(tz) ? tz! : "UTC";
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

/* The daily list of twins that approved themselves (server only). Once a day, after 9am ET, the owners get a push (the
 * accounts on FREE_ACCESS_EMAILS, as the money-path monitor) naming how many approved themselves yesterday and the
 * first few, linking to /admin/twins?view=auto&day=<yesterday>, where each one has a one-click Revoke. Nothing is sent
 * on a day with none. The post is remembered (worker heartbeat "twins:daily", its stats.day) so it goes once. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { heartbeat } from "@/lib/worker/store";
import { pushOwners, type NotifyOutcome } from "@/lib/monitor/money-path";
import { autoApproved } from "./store";

const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** "2026-11-04" and the hour in New York for an instant. */
export function etDay(ms: number): { day: string; hour: number } {
  const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** The UTC bounds of an ET day ("2026-11-04"), DST included. */
export function etBounds(day: string): { from: number; to: number } {
  const noon = Date.parse(`${day}T12:00:00Z`);
  const off = (ms: number) => { const { hour } = etDay(ms); return (new Date(ms).getUTCHours() - hour + 24) % 24; };
  const from = Date.parse(`${day}T00:00:00Z`) + off(noon) * 3_600_000;
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 36 * 3_600_000).toISOString().slice(0, 10);
  return { from, to: Date.parse(`${next}T00:00:00Z`) + off(Date.parse(`${next}T12:00:00Z`)) * 3_600_000 };
}

export function dailyMessage(rows: ReadonlyArray<{ polymarketTitle: string; kalshiTitle: string }>, day: string): { title: string; body: string; url: string } {
  const first = rows.slice(0, 3).map(r => r.polymarketTitle).join("; ");
  return { title: `${rows.length} ${rows.length === 1 ? "twin" : "twins"} approved themselves`,
    body: `${day}: ${first}${rows.length > 3 ? ` and ${rows.length - 3} more` : ""}. Revoke any in one click.`, url: `${appUrl()}/admin/twins?view=auto&day=${day}` };
}

export async function twinsDailyOnce(db: Db, now: number, notify: (a: { title: string; body: string; url: string }) => Promise<NotifyOutcome> = a => pushOwners(db, a)): Promise<{ day: string; n: number; sent: NotifyOutcome | "skipped" } | null> {
  const { day: today, hour } = etDay(now);
  if (hour < 9) return null;
  const yesterday = etDay(etBounds(today).from - 3_600_000).day;
  const last = (await db.execute(sql`select stats->>'day' as day from terminal.worker_heartbeats where job = 'twins:daily'`)).rows[0] as { day: string | null } | undefined;
  if (last?.day === yesterday) return null;
  const { from, to } = etBounds(yesterday);
  const rows = await autoApproved(db, from, to);
  const sent = rows.length ? await notify(dailyMessage(rows, yesterday)) : "skipped";
  await heartbeat(db, "twins:daily", true, null, { day: yesterday, n: rows.length, sent });
  return { day: yesterday, n: rows.length, sent };
}

/* The trial reminder ("Remind me before I'm charged", on by default on the paywall): about a day before a $1 trial
 * turns into $39 a month, a push to the member, once per trial (lifecycle_emails kind "trial_ending"). Whop also
 * emails its own "upcoming renewal" notice about 24 hours before the first charge, so a member without push still
 * hears. Never between 23:00 and 08:00 their time unless the charge is closer than that. Worker job "trial:remind". */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { inQuietHours, zoneOf } from "@/lib/alerts/quiet";
import { DEFAULT_QUIET } from "@/lib/millionaires/pings";
import { PLANS } from "@/lib/plans";

const HOUR = 3_600_000;
/** Send once the charge is this close... */
export const REMIND_WITHIN_MS = 26 * HOUR;
/** ...but not later than this (a reminder minutes before the charge helps nobody). */
export const REMIND_LAST_MS = HOUR;

export interface TrialEnding { userId: string; endsAt: number; timeZone: string | null; quietStart: string | null; quietEnd: string | null }

/** Trials that end within the window, with reminders on and not cancelled, not reminded yet. */
export async function endingTrials(db: Db, now: number): Promise<TrialEnding[]> {
  const r = await db.execute(sql`select u.id, u.access_until, u.settings from terminal.users u
    where u.membership_status = 'trialing' and coalesce(u.cancel_at_period_end, false) = false
      and u.access_until > ${new Date(now + REMIND_LAST_MS)} and u.access_until <= ${new Date(now + REMIND_WITHIN_MS)}
      and coalesce((u.settings->>'remindBeforeCharge')::boolean, true)
      and not exists (select 1 from terminal.lifecycle_emails l where l.user_id = u.id and l.kind = 'trial_ending' and l.period = to_char(u.access_until at time zone 'UTC', 'YYYY-MM-DD'))`);
  return (r.rows as Array<{ id: string; access_until: Date | string; settings: Record<string, unknown> | null }>).map(x => ({
    userId: x.id, endsAt: new Date(x.access_until).getTime(), timeZone: (x.settings?.timeZone as string | null | undefined) ?? null,
    quietStart: (x.settings?.quietStart as string | null | undefined) ?? null, quietEnd: (x.settings?.quietEnd as string | null | undefined) ?? null,
  }));
}

/** Whether to send now: outside the member's night, unless waiting for morning would be too late. Pure. */
export function remindNow(t: TrialEnding, now: number): boolean {
  if (t.endsAt - now <= 10 * HOUR) return true;
  return !inQuietHours(now, t.quietStart ?? DEFAULT_QUIET.start, t.quietEnd ?? DEFAULT_QUIET.end, t.timeZone);
}

/** The push's words: when the charge lands, on the member's clock, and how to cancel. Pure. */
export function trialReminderMessage(t: Pick<TrialEnding, "endsAt" | "timeZone">, appUrl: string, now: number): { title: string; body: string; url: string } {
  const zone = zoneOf(t.timeZone);
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const when = day(t.endsAt) === day(now) ? "today" : "tomorrow";
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(t.endsAt));
  return {
    title: `Your Insidir trial ends ${when}`,
    body: `At ${time} it becomes $${PLANS.insidir.price} a month. Keep it and do nothing, or cancel any time in Account.`,
    url: `${appUrl}/settings`,
  };
}

/** Claims the reminder for this trial (one per trial end date). False when it was already sent. */
export async function claimTrialReminder(db: Db, t: Pick<TrialEnding, "userId" | "endsAt">): Promise<boolean> {
  const period = new Date(t.endsAt).toISOString().slice(0, 10);
  const r = await db.execute(sql`insert into terminal.lifecycle_emails (user_id, kind, period) values (${t.userId}, 'trial_ending', ${period}) on conflict do nothing returning user_id`);
  return r.rows.length > 0;
}

/** One run: every due reminder, pushed to each of the member's devices. Returns how many members were reminded. */
export async function trialRemindersOnce(db: Db, now: number, deps: { appUrl: string; push(userId: string, msg: { title: string; body: string; url: string }): Promise<void> }): Promise<number> {
  let n = 0;
  for (const t of await endingTrials(db, now)) {
    if (!remindNow(t, now) || !(await claimTrialReminder(db, t))) continue;
    await deps.push(t.userId, trialReminderMessage(t, deps.appUrl, now));
    n++;
  }
  return n;
}

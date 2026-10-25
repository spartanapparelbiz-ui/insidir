/* Who gets an alert for which deal, and when, plus the daily summary. Pure: the worker passes the users, the deals
 * and `now`, and sends whatever this returns (alerts_sent's primary key makes each user/deal/channel go out once,
 * however many workers run).
 *
 *   Pro      web push as soon as a deal is found (the worker checks every few seconds)
 *   Insidir  web push within 60 seconds of detection
 *   Paid, no push   the same alerts by email instead (a backup), capped per hour
 *   Everyone who opts in   a daily summary email; for Free it is the only alert, built from the delayed feed
 *
 * The open Terminal updates live by itself, so alerts are for when it isn't open. The same filters as the feed
 * apply: region venues, the user's venues, safety, minimum ROI and size, categories. Second opinions never alert. */
import { feedFor, type FeedRow, type StoredOpp } from "@/lib/feed";
import { usd } from "@/lib/format";
import type { UserSettings } from "@/lib/db/schema";
import { entitlements } from "@/lib/plans";
import { allowedVenues, venuesOk } from "@/lib/region";
import type { Opportunity, Plan, Region } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";

/** Deals older than this at alert time are not sent: the prices have probably moved. */
export const ALERT_MAX_AGE_MS = 10 * 60_000;
/** Email alerts (the push backup) per user per hour, at most. */
export const EMAIL_ALERTS_PER_HOUR = 6;
/** The daily summary goes out at this UTC hour (13:00 UTC is 9am in New York, 8am in winter). */
export const DIGEST_HOUR_UTC = 13;
/** Deals listed in a summary. */
export const DIGEST_ROWS = 5;

export interface AlertUser {
  id: string;
  email: string | null;
  plan: Plan;
  region: Region | null;
  settings: UserSettings;
  hasPush: boolean;
  /** Email alerts sent to this user in the last hour. */
  emailsLastHour: number;
  lastDigestAt: number | null;
}

export interface AlertDeal { opp: Opportunity; firstSeenAt: number; active: boolean }

export type Channel = "push" | "email";
export interface AlertJob { userId: string; oppId: string; channel: Channel }

export function dueAlerts(users: readonly AlertUser[], deals: readonly AlertDeal[], now: number): AlertJob[] {
  const jobs: AlertJob[] = [];
  for (const u of users) {
    const delay = entitlements(u.plan).alertDelaySeconds;
    if (delay === null) continue;
    const s = u.settings;
    const channel: Channel | null = s.alertPush && u.hasPush ? "push" : s.alertEmail && u.email ? "email" : null;
    if (!channel) continue;
    let emailBudget = Math.max(0, EMAIL_ALERTS_PER_HOUR - u.emailsLastHour);
    const venues = allowedVenues(u.region, s.venues);
    const eligible = deals.filter(d => {
      const o = d.opp;
      if (!d.active || o.kind === "second_opinion") return false;
      const age = now - d.firstSeenAt;
      if (age < delay * 1000 || age > ALERT_MAX_AGE_MS + delay * 1000) return false;
      if (!venuesOk(o, venues)) return false;
      if (!(o.safety === "green" || (o.safety === "yellow" && s.showYellow) || (o.safety === "red" && s.showRed))) return false;
      if (o.roi < Math.max(s.alertMinRoi, s.minRoi)) return false;
      if (s.minSizeUsd > 0 && o.cost + o.fees < s.minSizeUsd) return false;
      if (s.categories.length && !o.categories.some(c => s.categories.includes(c))) return false;
      return true;
    }).sort((a, b) => b.opp.profitPerDay - a.opp.profitPerDay);
    for (const d of eligible) {
      if (channel === "email") { if (emailBudget <= 0) break; emailBudget--; }
      jobs.push({ userId: u.id, oppId: d.opp.id, channel });
    }
  }
  return jobs;
}

/** The alert text: facts only, the lock condition stated, no advice. */
export function alertText(o: Opportunity, appUrl: string, channel: Channel): { title: string; body: string; url: string } {
  const legs = o.legs.map(l => `${l.side.toUpperCase()} on ${VENUE_NAME[l.venue]} at ${Math.round(l.avgPrice * 1000) / 10}¢`).join(" + ");
  const url = `${appUrl}/api/alerts/opened?opp=${encodeURIComponent(o.id)}&ch=${channel}`;
  return {
    title: `${(o.roi * 100).toFixed(1)}% · ${o.title}`.slice(0, 120),
    body: `${legs}. ${usd(o.profit)} after fees on up to ${usd(o.cost + o.fees)}, if both sides fill and both markets settle the same way.`,
    url,
  };
}

/** Whether today's summary is due: opted in, has an email, past the hour, not sent in the last 20 hours. */
export function digestDue(u: Pick<AlertUser, "email" | "settings" | "lastDigestAt">, now: number): boolean {
  if (!u.settings.emailDigest || !u.email) return false;
  if (new Date(now).getUTCHours() < DIGEST_HOUR_UTC) return false;
  return u.lastDigestAt === null || now - u.lastDigestAt > 20 * 3_600_000;
}

/** The summary's rows: the feed exactly as this user's plan sees it (Free: the delayed top 3, sizes withheld). */
export function digestRows(u: AlertUser, opps: readonly StoredOpp[], now: number): FeedRow[] {
  const s = u.settings;
  return feedFor(opps, { plan: u.plan, region: u.region, minRoi: s.minRoi, minSizeUsd: s.minSizeUsd, categories: s.categories, venues: s.venues,
    showYellow: s.showYellow, showRed: s.showRed }, now).filter(r => r.kind !== "second_opinion").slice(0, DIGEST_ROWS);
}

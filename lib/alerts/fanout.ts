/* Who gets an alert for which deal, and when. Pure: the worker passes the users, the deals and `now`, and sends
 * whatever this returns (alerts_sent's primary key makes each user/deal/channel go out once, however many workers).
 *
 *   Pro      alerts as soon as a deal is found (the worker checks every few seconds)
 *   Insidir  alerts within 60 seconds of detection
 *   Free     no alerts
 *
 * The same filters as the feed apply: region venues, the user's venues, safety, minimum ROI and size, categories.
 * Second opinions never alert (they are not locks). */
import { usd } from "@/lib/format";
import type { UserSettings } from "@/lib/db/schema";
import { entitlements } from "@/lib/plans";
import { allowedVenues, venuesOk } from "@/lib/region";
import type { Opportunity, Plan, Region } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";

/** Deals older than this at alert time are not sent: the prices have probably moved. */
export const ALERT_MAX_AGE_MS = 10 * 60_000;

export interface AlertUser {
  id: string;
  plan: Plan;
  region: Region | null;
  settings: UserSettings;
  hasPush: boolean;
  telegramChatId: string | null;
}

export interface AlertDeal { opp: Opportunity; firstSeenAt: number; active: boolean }

export type Channel = "push" | "telegram";
export interface AlertJob { userId: string; oppId: string; channel: Channel }

export function dueAlerts(users: readonly AlertUser[], deals: readonly AlertDeal[], now: number): AlertJob[] {
  const jobs: AlertJob[] = [];
  for (const u of users) {
    const delay = entitlements(u.plan).alertDelaySeconds;
    if (delay === null) continue;
    const s = u.settings;
    const channels: Channel[] = [];
    if (s.alertPush && u.hasPush) channels.push("push");
    if (s.alertTelegram && u.telegramChatId) channels.push("telegram");
    if (!channels.length) continue;
    const venues = allowedVenues(u.region, s.venues);
    for (const d of deals) {
      const o = d.opp;
      if (!d.active || o.kind === "second_opinion") continue;
      const age = now - d.firstSeenAt;
      if (age < delay * 1000 || age > ALERT_MAX_AGE_MS + delay * 1000) continue;
      if (!venuesOk(o, venues)) continue;
      if (!(o.safety === "green" || (o.safety === "yellow" && s.showYellow) || (o.safety === "red" && s.showRed))) continue;
      if (o.roi < Math.max(s.alertMinRoi, s.minRoi)) continue;
      if (s.minSizeUsd > 0 && o.cost + o.fees < s.minSizeUsd) continue;
      if (s.categories.length && !o.categories.some(c => s.categories.includes(c))) continue;
      for (const channel of channels) jobs.push({ userId: u.id, oppId: o.id, channel });
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

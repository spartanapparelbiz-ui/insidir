/* Activation and retention emails: written, never sent (Insidir sends no email; nothing calls them any more):
 *   welcome       day 0, once: you're in, follow 3 traders, set up your first alert.
 *   trial_ending  day 2 of the $1 three-day trial, once: "Your trial ends tomorrow, here's what you caught", with
 *                 real moves from the traders they follow since they joined (or the biggest moves since then).
 *   weekly        Mondays after 9am ET: how the traders they follow did that week (settled moves only). Not sent
 *                 when nothing they follow settled.
 * Each is sent once per user (and per ISO week for weekly; terminal.lifecycle_emails), only to paying members with an
 * email, never after the one-click unsubscribe (settings.noLifecycle). Every line is a stored move; nothing is made up:
 * an email with nothing real to say isn't sent. The content builders are pure; lifecycleOnce does the reads and sends. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, events, follows, lifecycleEmails, moves, users } from "@/lib/db/schema";
import { dollars, recordLine } from "@/lib/moves/copy";
import { walletLabel } from "@/lib/moves/records";
import { fromRow, recordsFor } from "@/lib/moves/store";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";
import type { Plan } from "@/lib/types";

export type LifecycleKind = "welcome" | "trial_ending" | "weekly";
const H = 3_600_000, DAY = 24 * H;
export interface LifecycleEmail { kind: LifecycleKind; period: string; subject: string; heading: string; lines: Array<{ text: string; url?: string }>; cta: { label: string; url: string } }

const DAY_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const PARTS_ET = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" });

/** "2026-W44" (ISO week, by the Eastern calendar day). */
export function isoWeek(now: number): string {
  const [m, d, y] = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).format(new Date(now)).split("/").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - start.getTime()) / DAY + 1) / 7)).padStart(2, "0")}`;
}
const mondayMorningET = (now: number) => {
  const p = PARTS_ET.formatToParts(new Date(now));
  return p.find(x => x.type === "weekday")?.value === "Mon" && Number(p.find(x => x.type === "hour")?.value) >= 9;
};

/** Which emails are due for one member right now. `paidAt` is their first payment (the trial's start). */
export function dueKinds(u: { plan: Plan; email: string | null; paidAt: number | null; cancelAtPeriodEnd: boolean; optedOut: boolean; follows: number },
  sent: ReadonlySet<string>, now: number): Array<{ kind: LifecycleKind; period: string }> {
  if (!isPaid(u.plan) || !u.email || u.optedOut || u.paidAt === null) return [];
  const out: Array<{ kind: LifecycleKind; period: string }> = [];
  const age = now - u.paidAt;
  // Day 0 only (not to everyone already a member when this shipped).
  if (!sent.has("welcome:once") && age < DAY) out.push({ kind: "welcome", period: "once" });
  // There is no trial any more (one plan, $39/month), so the "trial ends tomorrow" email is never due.
  const week = isoWeek(now);
  if (u.follows > 0 && mondayMorningET(now) && age >= 5 * DAY && !sent.has(`weekly:${week}`)) out.push({ kind: "weekly", period: week });
  return out;
}

const line = (m: Move, rec: TraderRecord | null) =>
  `${m.wallet ? walletLabel(m.wallet, m.walletName) : "Someone"} put ${dollars(m.amount)} on ${m.outcome} · ${m.marketTitle} · ${DAY_ET.format(new Date(m.at))}${rec && recordLine(rec) ? ` (${recordLine(rec)})` : ""}`;

export function welcomeEmail(appUrl: string): LifecycleEmail {
  return {
    kind: "welcome", period: "once",
    subject: "You're in. Set up your first alert.",
    heading: "You're in.",
    lines: [
      { text: "Three steps and Insidir works for you, even with the app closed:" },
      { text: "1. Follow 3 traders. The top traders by real profit are here.", url: `${appUrl}/top?from=welcome` },
      { text: "2. Turn on alerts: we ping you the moment someone you follow makes a big move. On an iPhone, add Insidir to your Home Screen first (Share, then Add to Home Screen).", url: `${appUrl}/alerts?from=welcome` },
      { text: "3. Keep an eye on the live feed: every big bet and trade, the second it happens.", url: `${appUrl}/feed?from=welcome` },
    ],
    cta: { label: "Set up your first alert", url: `${appUrl}/alerts?from=welcome` },
  };
}

/** `caught`: real moves since they joined, from traders they follow when there are any (else the biggest moves). */
export function trialEndingEmail(caught: readonly Move[], fromFollows: boolean, records: ReadonlyMap<string, TraderRecord>, appUrl: string): LifecycleEmail {
  const lines: LifecycleEmail["lines"] = caught.length
    ? [{ text: fromFollows ? "Since you joined, the traders you follow made these big moves:" : "Since you joined, these were the biggest moves on Insidir:" },
      ...caught.slice(0, 5).map(m => ({ text: line(m, m.wallet ? records.get(m.wallet) ?? null : null), url: `${appUrl}/market/${encodeURIComponent(m.marketId)}?from=trial` }))]
    : [{ text: "No big moves from the traders you follow yet. Follow a few more and we'll ping you when they move.", url: `${appUrl}/top?from=trial` }];
  return {
    kind: "trial_ending", period: "once",
    subject: "Your trial ends tomorrow, here's what you caught",
    heading: "Your trial ends tomorrow.",
    lines: [...lines, { text: `Your Insidir plan continues at $39/mo after tomorrow. Cancel anytime in one tap on your Account page.`, url: `${appUrl}/settings?from=trial` }],
    cta: { label: "See the live feed", url: `${appUrl}/feed?from=trial` },
  };
}

/** The week's settled moves by followed traders, grouped per trader. Null when nothing settled. */
export function weeklyEmail(settled: readonly Move[], records: ReadonlyMap<string, TraderRecord>, week: string, appUrl: string): LifecycleEmail | null {
  if (!settled.length) return null;
  const by = new Map<string, Move[]>();
  for (const m of settled) if (m.wallet) by.set(m.wallet, [...(by.get(m.wallet) ?? []), m]);
  const lines: LifecycleEmail["lines"] = [];
  for (const [w, ms] of by) {
    const won = ms.filter(m => m.result === "won").length, lost = ms.filter(m => m.result === "lost").length;
    const name = walletLabel(w, ms[0]!.walletName);
    lines.push({ text: `${name}: ${won} won, ${lost} lost this week${recordLine(records.get(w) ?? null) ? ` · ${recordLine(records.get(w) ?? null)}` : ""}`, url: `${appUrl}/p/${w}?from=weekly` });
    for (const m of ms.slice(0, 3)) lines.push({ text: `${m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Refunded"}: ${dollars(m.amount)} on ${m.outcome} · ${m.marketTitle}` });
  }
  return {
    kind: "weekly", period: week,
    subject: "This week from the traders you follow",
    heading: "This week from the traders you follow.",
    lines: [...lines, { text: "Real results from public data. Big traders lose too; past results don't predict future ones." }],
    cta: { label: "See the live feed", url: `${appUrl}/feed?from=weekly` },
  };
}

/** One pass: every paying member's due emails, built from stored moves, sent once each. Returns how many went out. */
export async function lifecycleOnce(db: Db, now: number, appUrl: string,
  send: (to: string, userId: string, e: LifecycleEmail) => Promise<boolean>): Promise<number> {
  const members = (await db.select().from(users).where(isNotNull(users.email))).filter(u => isPaid(u.plan));
  if (!members.length) return 0;
  const ids = members.map(u => u.id);
  const paid = await db.select({ userId: events.userId, at: events.at }).from(events).where(and(eq(events.name, "paid"), inArray(events.userId, ids)));
  const sentRows = await db.select().from(lifecycleEmails).where(inArray(lifecycleEmails.userId, ids));
  const fs = await db.select().from(follows).where(and(inArray(follows.userId, ids), eq(follows.kind, "trader")));
  let n = 0;
  for (const u of members) {
    const paidAt = Math.min(...paid.filter(p => p.userId === u.id).map(p => p.at.getTime()));
    const traders = fs.filter(f => f.userId === u.id).map(f => f.target);
    const sent = new Set(sentRows.filter(r => r.userId === u.id).map(r => `${r.kind}:${r.period}`));
    const due = dueKinds({ plan: u.plan, email: u.email, paidAt: Number.isFinite(paidAt) ? paidAt : null, cancelAtPeriodEnd: u.cancelAtPeriodEnd,
      optedOut: Boolean({ ...DEFAULT_SETTINGS, ...u.settings }.noLifecycle), follows: traders.length }, sent, now);
    for (const d of due) {
      let e: LifecycleEmail | null = null;
      if (d.kind === "welcome") e = welcomeEmail(appUrl);
      else if (d.kind === "trial_ending") {
        const since = new Date(paidAt);
        const mine = traders.length ? (await db.select().from(moves).where(and(inArray(moves.wallet, traders), gte(moves.at, since), isNull(moves.hiddenAt))).orderBy(desc(moves.amount)).limit(5)).map(fromRow) : [];
        const caught = mine.length ? mine : (await db.select().from(moves).where(and(gte(moves.at, since), lte(moves.at, new Date(now)), isNull(moves.hiddenAt))).orderBy(desc(moves.amount)).limit(5)).map(fromRow);
        e = trialEndingEmail(caught, mine.length > 0, await recordsFor(db, caught.map(m => m.wallet ?? "")), appUrl);
      } else {
        const settled = (await db.select().from(moves).where(and(inArray(moves.wallet, traders), isNotNull(moves.result), gte(moves.settledAt, new Date(now - 7 * DAY)), isNull(moves.hiddenAt))).orderBy(desc(moves.settledAt)).limit(60)).map(fromRow);
        e = weeklyEmail(settled, await recordsFor(db, traders), d.period, appUrl);
      }
      if (!e) continue;
      if (await send(u.email!, u.id, e)) {
        await db.insert(lifecycleEmails).values({ userId: u.id, kind: e.kind, period: e.period, sentAt: new Date(now) }).onConflictDoNothing();
        n++;
      }
    }
  }
  return n;
}

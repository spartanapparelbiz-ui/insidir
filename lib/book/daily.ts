/* The Book's daily summary push (worker book:daily): once a day at the member's chosen local time (settings.bookPushAt),
 * their open bets at Kalshi prices and what settled in the last 24 hours. Claimed once per local day. */
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, users } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/billing/access";
import { isPaid } from "@/lib/plans";
import { localMinutes, minutesOf, validTimeZone } from "@/lib/alerts/quiet";
import { bookFor, summarize, type Entry } from "./book";

/** The member's local date ("2026-11-04") when the push is due now (within two hours after the chosen time), else null. Pure. */
export function bookPushDue(now: number, at: string | null | undefined, tz: string | null | undefined): string | null {
  const m = minutesOf(at);
  if (m === null) return null;
  const t = localMinutes(now, tz);
  if (t < m || t >= m + 120) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: validTimeZone(tz) ? tz! : "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

const usd = (n: number) => `$${Math.abs(n) < 100 ? Math.abs(n).toFixed(2).replace(/\.00$/, "") : Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(n)}`;

/** The push's words. Pure. */
export function bookPushText(entries: readonly Entry[], now: number): { title: string; body: string } {
  const s = summarize(entries);
  const day = entries.filter(e => e.settledAt !== null && e.settledAt > now - 86_400_000 && (e.result === "won" || e.result === "lost"));
  const won = day.filter(e => e.result === "won"), lost = day.filter(e => e.result === "lost");
  const open = s.open ? `${s.open} open, ${usd(s.exposure)} at risk${s.live !== null ? `, ${signed(s.live)} at Kalshi prices` : ""}.` : "Nothing open.";
  const settled = day.length ? ` Last 24 hours: ${won.length} won${won.length ? ` (${signed(won.reduce((a, e) => a + (e.pnl ?? 0), 0))})` : ""}, ${lost.length} lost${lost.length ? ` (${signed(lost.reduce((a, e) => a + (e.pnl ?? 0), 0))})` : ""}.` : " Nothing settled in the last 24 hours.";
  return { title: "Your Book today", body: open + settled };
}

export async function bookDailyOnce(db: Db, now: number, deps: { claim(userId: string, key: string): Promise<boolean>; push(userId: string, msg: { title: string; body: string; url: string }): Promise<void>; appUrl: string }): Promise<number> {
  let n = 0;
  for (const u of await db.select().from(users)) {
    const s = { ...DEFAULT_SETTINGS, ...u.settings };
    if (!s.bookPushAt || !isPaid(effectivePlan(u))) continue;
    const day = bookPushDue(now, s.bookPushAt, s.timeZone);
    if (!day || !(await deps.claim(u.id, `book:${day}`))) continue;
    const { entries } = await bookFor(db, u.id, now);
    await deps.push(u.id, { ...bookPushText(entries, now), url: `${deps.appUrl}/book` });
    n++;
  }
  return n;
}

/* What the member home shows, read in parallel (server only).
 *   Tabs      their onboarding answers (lib/read/member.ts BET_ON: NFL, NBA, CFB, NHL, MLB, Soccer, Elections), each a
 *             tracker rule over positions; with none (or only Other), the five categories.
 *   Cards     this week's busiest markets in each tab (lib/nx/data.ts marketCards), with real sparklines or none.
 *   Chips     the busiest market of each tab: the ask box's suggestions, and "Start with these" for a new member.
 *   Mine      Your markets (lib/read/member.ts yourMarkets), with what moved since their last visit, in dollars.
 *   Week      proven money's record on their markets this week. */
import type { SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { BET_ON, weeklyRecap, yourMarkets, type WeekRecap, type YourMarket } from "@/lib/read/member";
import { trackerBySlug, trackerWhere } from "@/lib/trackers";
import { CATS, marketCards, withSparks, type Cat, type Clients, type MarketCard } from "./data";
import { fmt } from "./fmt";

export interface MemberTab { key: string; label: string; cards: MarketCard[] }
export interface MemberHomeData { tabs: MemberTab[]; chips: MarketCard[]; mine: YourMarket[]; week: WeekRecap }

/** The member's tabs: one per onboarding answer that has a tracker rule, else the five categories. */
export function memberTabs(betOn: readonly string[]): Array<{ key: string; label: string; where?: SQL; cat?: Cat }> {
  const mine = BET_ON.filter(([k, , slug]) => betOn.includes(k) && slug).map(([k, label, slug]) => {
    const t = trackerBySlug(slug!);
    return t ? { key: k, label, where: trackerWhere(t) } : null;
  }).filter((x): x is { key: (typeof BET_ON)[number][0]; label: (typeof BET_ON)[number][1]; where: SQL } => x !== null);
  return mine.length ? mine : CATS.map(c => ({ key: c.key, label: c.label, cat: c.key }));
}

export async function memberHomeData(db: Db, clients: Clients, userId: string, betOn: readonly string[], now: number): Promise<MemberHomeData> {
  const tabs = memberTabs(betOn);
  const [lists, mine, week] = await Promise.all([
    Promise.all(tabs.map(t => marketCards(db, now, { where: t.where ?? null, cat: t.cat ?? null, limit: 8 }).catch(() => [] as MarketCard[]))),
    yourMarkets(db, userId, now).catch(() => [] as YourMarket[]),
    weeklyRecap(db, userId, now).catch((): WeekRecap => ({ right: 0, of: 0, lines: [] })),
  ]);
  const withCards = tabs.map((t, i) => ({ key: t.key, label: t.label, cards: lists[i]! })).filter(t => t.cards.length);
  await withSparks(withCards.flatMap(t => t.cards), clients.polymarket, now).catch(() => undefined);
  const seen = new Set<string>(), chips: MarketCard[] = [];
  for (const t of withCards) for (const c of t.cards) { if (!seen.has(c.key)) { seen.add(c.key); chips.push(c); break; } }
  // Fewer than 5 tabs: fill the chips from the next busiest in their tabs.
  for (const t of withCards) for (const c of t.cards) if (chips.length < 5 && !seen.has(c.key)) { seen.add(c.key); chips.push(c); }
  return { tabs: withCards, chips: chips.slice(0, 5), mine, week };
}

/** "Good morning / afternoon / evening", by the hour in New York. */
export function greeting(now: number): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(new Date(now)));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The skyline's categories for a member: their sports answers are Sports, Elections is Elections; none, every category. */
export function memberCats(betOn: readonly string[]): Cat[] {
  const out = new Set<Cat>();
  for (const k of betOn) { if (k === "elections") out.add("elections"); else if (["nfl", "nba", "cfb", "nhl", "mlb", "soccer"].includes(k)) out.add("sports"); }
  return [...out];
}

const DAY_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const CLOCK_ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** "+$120K proven on Chiefs since 9:14 AM": the side whose proven dollars changed most since their last visit; null when
 *  nothing changed or there is no earlier visit. */
export function movedLine(m: YourMarket, now: number): string | null {
  const s = m.since;
  if (!s || (s.yes === 0 && s.no === 0)) return null;
  const d = m.latest.data, yes = Math.abs(s.yes) >= Math.abs(s.no);
  const v = yes ? s.yes : s.no, label = yes ? d.yesLabel : d.noLabel;
  const when = DAY_ET.format(new Date(s.at)) === DAY_ET.format(new Date(now)) ? CLOCK_ET.format(new Date(s.at)) : DAY_ET.format(new Date(s.at));
  return `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), "usd")} proven on ${label} since ${when}`;
}

/** "Good evening, Sam." — the first word of their name when it looks like a name; else "Good evening." */
export function hello(greet: string, name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return /^[\p{Lu}][\p{L}'’-]{0,30}$/u.test(first) ? `${greet}, ${first}.` : `${greet}.`;
}

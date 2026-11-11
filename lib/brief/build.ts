/* The Daily Brief (/brief, and by email at 8 AM ET for members who opt in): the 5 biggest things the $1M+ money did
 * since 8 PM ET the evening before, each in exactly two lines computed in code (what happened; what it means), plus
 * what changed on the member's watched bets. The model may only reword the lines (lib/briefing/write.ts: every number
 * checked against the facts, else the template lines), and only for the shared items, cached 15 minutes, within the
 * analyst's monthly spend cap.
 *   members   the side, prices and what $100 pays; their watched bets' value now and the $1M+ money with and against them
 *   visitors  no side and no side's price (either gives the side away), and the board's 60-minute delay
 * A wallet is only ever its tier and short address. Information, not advice. Server only (buildBrief); the line
 * builders are pure. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { category as categoryInfo, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { analystConfigured } from "@/lib/analyst/llm";
import { notesCapUsd } from "@/lib/analyst/store";
import { cents, payout, pnlNow, signed } from "@/lib/briefing/math";
import { walletFacts, walletName, type WalletFacts } from "@/lib/briefing/wallets";
import { writeSections, type FactSection } from "@/lib/briefing/write";
import { marketPath } from "@/lib/entities/slug";
import { memo } from "@/lib/memo";
import { BOARD_DELAY_MS, midnightET } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { dbUsageStore } from "@/lib/worker/store";
import { usualText, winsIf } from "./explain";

export const BRIEF_TOP = 5;

/** 8 PM ET the evening before `now`'s ET day. */
export const briefSince = (now: number): number => midnightET(now) - 4 * 3_600_000;

/** One group of bets: a wallet's bets on one market and side in the window, money added up. */
export interface BriefGroup {
  wallet: string; marketId: string; side: "yes" | "no"; outcome: string; title: string; category: CategorySlug;
  amount: number; price: number; n: number; at: number; priceNow: number | null; closed: boolean; pnl: number | null;
}
export interface BriefItem {
  key: string; marketId: string; title: string; href: string; category: CategorySlug; tier: WalletFacts["tier"]; short: string;
  amount: number; n: number; at: number;
  /** Members only (null for visitors). */
  side: "yes" | "no" | null; outcome: string | null; price: number | null; priceNow: number | null;
  /** Exactly two: what happened, then what it means. */
  lines: [string, string];
}
export interface WatchedRow { id: string; marketId: string; title: string; side: "yes" | "no"; outcome: string; price: number; amount: number; shares: number; priceNow: number | null; against: number; with: number }
export interface WatchedItem { id: string; marketId: string; title: string; href: string; lines: [string, string] }
export interface Brief { since: number; now: number; member: boolean; items: BriefItem[]; watched: WatchedItem[]; origin: "model" | "template" }

const tradable = (p: number | null): p is number => p !== null && p > 0.005 && p < 0.995;
const catName = (c: CategorySlug) => categoryInfo(c).name;
const quoted = (t: string) => `“${t.replace(/[“”"]/g, "")}”`;

/** The two lines for one group, as a member or a visitor may see them. Pure. */
export function itemLines(g: BriefGroup, f: Pick<WalletFacts, "tier" | "short" | "record" | "usualBet">, member: boolean): [string, string] {
  const who = walletName(f), over = g.n > 1 ? ` over ${g.n} trades` : "";
  const usual = usualText(g.amount, f.usualBet);
  const record = f.record ? `Its settled ${catName(g.category)} record: ${f.record.line}.` : null;
  if (!member) {
    const l2 = [usual ? `That's ${usual}.` : null, record].filter(Boolean).join(" ") || (g.pnl && g.pnl > 0 ? `This wallet is up ${dollars(g.pnl)} all-time.` : `Members see which side it took.`);
    return [`${who} put ${dollars(g.amount)} on ${quoted(g.title)}${over}. Members see the side.`, l2];
  }
  const l1 = `${who} put ${dollars(g.amount)} on ${g.outcome} in ${quoted(g.title)} at ${cents(g.price)}${over}.`;
  const parts: string[] = [];
  if (tradable(g.priceNow)) {
    const moved = Math.round(g.priceNow * 100) - Math.round(g.price * 100);
    parts.push(`At ${cents(g.priceNow)} now, $100 pays ${dollars(payout(g.priceNow).pays)} ${winsIf(g.outcome)}${moved ? ` (${moved > 0 ? "up" : "down"} ${Math.abs(moved)}¢ since they bought)` : ""}${usual ? `; ${usual}` : ""}.`);
  } else if (usual) parts.push(`That's ${usual}.`);
  if (record) parts.push(record);
  return [l1, parts.join(" ") || `What it means: ${dollars(g.amount)} is riding on ${g.outcome}.`];
}

/** The two lines for one of the member's watched bets. Pure. */
export function watchedLines(w: WatchedRow): [string, string] {
  const l1 = tradable(w.priceNow)
    ? `Your ${dollars(w.amount)} on ${w.outcome} in ${quoted(w.title)}: in at ${cents(w.price)}, now ${cents(w.priceNow)}.`
    : `Your ${dollars(w.amount)} on ${w.outcome} in ${quoted(w.title)}: in at ${cents(w.price)}.`;
  const value = tradable(w.priceNow) ? pnlNow(w.shares, w.amount, w.priceNow) : null;
  const flows = w.against || w.with
    ? `Overnight, $1M+ wallets put ${dollars(w.against)} against you${w.with ? ` and ${dollars(w.with)} with you` : ""}.`
    : "No $1M+ money moved on it overnight.";
  return [l1, `${value ? `It's worth ${dollars(value.value)} (${signed(value.pnl)}). ` : ""}${flows}`];
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** The biggest groups of millionaire bets in the window. */
export async function briefGroups(db: Db, since: number, until: number, limit = BRIEF_TOP): Promise<BriefGroup[]> {
  const r = await db.execute(sql`select b.wallet, b.market_id, b.outcome_side, max(b.outcome) as outcome, max(b.market_title) as title, max(b.category) as category,
      sum(b.amount)::float as amount, (sum(b.amount * b.price) / nullif(sum(b.amount), 0))::float as price, count(*)::int as n, max(b.at) as at,
      max(i.yes_price)::float as yes, bool_or(coalesce(i.closed, false)) as closed, max(w.pnl)::float as pnl
    from terminal.millionaire_bets b
      left join terminal.market_info i on i.source = b.source and i.market_id = b.market_id
      left join terminal.watchlist w on w.wallet = b.wallet
    where b.tier = 'millionaire' and b.at >= ${new Date(since)} and b.at <= ${new Date(until)}
    group by b.wallet, b.market_id, b.outcome_side order by sum(b.amount) desc limit ${limit}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const side = x.outcome_side === "no" ? "no" as const : "yes" as const, yes = num(x.yes), cat = String(x.category);
    return { wallet: String(x.wallet), marketId: String(x.market_id), side, outcome: String(x.outcome), title: String(x.title), category: isCategory(cat) ? cat : "world",
      amount: Number(x.amount), price: Number(x.price), n: Number(x.n), at: new Date(String(x.at)).getTime(),
      priceNow: yes === null ? null : side === "no" ? 1 - yes : yes, closed: Boolean(x.closed), pnl: num(x.pnl) };
  });
}

/** The member's open watched bets, the price now and the $1M+ money with and against them since `since`. */
export async function watchedRows(db: Db, userId: string, since: number): Promise<WatchedRow[]> {
  const r = await db.execute(sql`select w.id, w.market_id, w.market_title, w.side, w.outcome, w.price, w.amount, w.shares, i.yes_price,
      coalesce((select sum(b.amount) from terminal.millionaire_bets b where b.market_id = w.market_id and b.tier = 'millionaire' and b.at >= ${new Date(since)} and b.outcome_side <> w.side), 0)::float as against,
      coalesce((select sum(b.amount) from terminal.millionaire_bets b where b.market_id = w.market_id and b.tier = 'millionaire' and b.at >= ${new Date(since)} and b.outcome_side = w.side), 0)::float as with_us
    from terminal.watched_bets w left join terminal.market_info i on i.source = 'polymarket' and i.market_id = w.market_id
    where w.user_id = ${userId} and w.result is null and w.removed_at is null order by w.created_at desc limit 20`);
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const side = x.side === "no" ? "no" as const : "yes" as const, yes = num(x.yes_price);
    return { id: String(x.id), marketId: String(x.market_id), title: String(x.market_title), side, outcome: String(x.outcome), price: Number(x.price), amount: Number(x.amount),
      shares: Number(x.shares), priceNow: yes === null ? null : side === "no" ? 1 - yes : yes, against: Number(x.against), with: Number(x.with_us) };
  });
}

const month = (now: number) => new Date(now).toISOString().slice(0, 7);

/** Rewords the shared items' lines within the spend cap; template lines otherwise. Exactly two lines per item. */
async function reword(db: Db, items: BriefItem[], member: boolean, now: number): Promise<{ items: BriefItem[]; origin: "model" | "template" }> {
  if (!items.length || !analystConfigured()) return { items, origin: "template" };
  const key = `brief:${member ? "m" : "v"}:${items.map(i => `${i.key}:${Math.round(i.amount)}:${i.priceNow === null ? "" : Math.round(i.priceNow * 100)}`).join("|")}`;
  return memo(key, 15 * 60_000, async () => {
    const usage = dbUsageStore(db), mk = `${month(now)}:brief`;
    if ((await usage.getMonthSpendUsd(mk).catch(() => Infinity)) >= notesCapUsd()) return { items, origin: "template" as const };
    const facts: FactSection[] = items.map((it, i) => ({ key: `i${i}`, title: it.title, lines: [...it.lines] }));
    const w = await writeSections(facts);
    if (w.costUsd) await usage.addSpendUsd(mk, w.costUsd).catch(() => undefined);
    let used = false;
    const out = items.map((it, i) => {
      const got = w.sections[`i${i}`];
      if (got && got.length === 2 && (got[0] !== it.lines[0] || got[1] !== it.lines[1])) { used = true; return { ...it, lines: [got[0]!, got[1]!] as [string, string] }; }
      return it;
    });
    return { items: out, origin: used ? "model" as const : "template" as const };
  });
}

/** The brief for a member (`userId`, their watched bets) or a visitor (no side, the board's delay). */
export async function buildBrief(db: Db, now: number, o: { member: boolean; userId?: string | null; useModel?: boolean }): Promise<Brief> {
  const since = briefSince(now), until = o.member ? now : now - BOARD_DELAY_MS;
  const groups = await briefGroups(db, since, until);
  const items: BriefItem[] = [];
  for (const g of groups) {
    const f = (await walletFacts(db, [g.wallet], g.category)).get(g.wallet.toLowerCase())!;
    items.push({
      key: `${g.marketId}:${g.side}:${g.wallet.slice(2, 10)}`, marketId: g.marketId, title: g.title, href: marketPath(g.marketId, g.title), category: g.category,
      tier: f.tier, short: f.short, amount: g.amount, n: g.n, at: g.at,
      side: o.member ? g.side : null, outcome: o.member ? g.outcome : null, price: o.member ? g.price : null, priceNow: o.member ? g.priceNow : null,
      lines: itemLines(g, f, o.member),
    });
  }
  const worded = o.useModel === false ? { items, origin: "template" as const } : await reword(db, items, o.member, now).catch(() => ({ items, origin: "template" as const }));
  const watched = o.member && o.userId ? (await watchedRows(db, o.userId, since).catch(() => [])).map(w => ({ id: w.id, marketId: w.marketId, title: w.title, href: marketPath(w.marketId, w.title), lines: watchedLines(w) })) : [];
  return { since, now, member: o.member, items: worded.items, watched, origin: worded.origin };
}

const etDay = (now: number) => new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** "What we told you": each brief line a member was shown, once per member, market, side and day. */
export async function logBriefShown(db: Db, userId: string, b: Brief): Promise<void> {
  const day = etDay(b.now);
  for (const it of b.items) {
    if (!it.side) continue;
    await db.execute(sql`insert into terminal.told_log (id, user_id, kind, market_id, market_title, side, price, headline, body, facts)
      values (${`brief:${userId}:${it.marketId}:${it.side}:${day}`}, ${userId}, 'brief', ${it.marketId}, ${it.title}, ${it.side}, ${it.priceNow ?? it.price}, ${it.lines[0]}, ${it.lines[1]},
        ${JSON.stringify({ amount: it.amount, n: it.n, tier: it.tier, short: it.short, outcome: it.outcome, price: it.price, priceNow: it.priceNow, at: it.at })}::jsonb)
      on conflict (id) do nothing`);
  }
}

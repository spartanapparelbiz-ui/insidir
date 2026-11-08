/* The public record's reads (/record, /record/csv): the rows of terminal.record_log in a filter, newest first, and the
 * summary computed from every row in that filter (never just the page shown). A visitor never gets an open position's
 * side: recordView() drops the side, both prices, the move and the transaction and wallet links from open rows unless
 * the viewer is a member. Settled and sold rows are public in full. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { CATEGORIES, category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { shortWallet } from "@/lib/millionaires/watchlist";
import type { BetVerify } from "@/lib/millionaires/queries";

export type Result = "won" | "lost" | "sold" | "void" | "open";
export type Flag = "millionaire" | "pro" | "unusual" | "disagreement";
export const FLAGS: readonly Flag[] = ["millionaire", "pro", "unusual", "disagreement"];
export const FLAG_NAME: Record<Flag, string> = { millionaire: "Millionaire ($1M+)", pro: "Pro ($100K+)", unusual: "Unusual bet", disagreement: "Disagrees with the price" };
export const TIER_NAME: Record<string, string> = { millionaire: "Millionaire", pro: "Pro", new: "New wallet" };
export const RESULTS: readonly Result[] = ["won", "lost", "sold", "void", "open"];

export interface RecordFilter {
  category: string | null;
  tier: "millionaire" | "pro" | "new" | null;
  flag: Flag | null;
  result: Result | null;
  wallet: string | null;
  /** ET dates, YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

const DAY = 86_400_000;
const etDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The filter from a query string; the default is the last 30 days. */
export function readFilter(q: Record<string, string | string[] | undefined>, now: number): RecordFilter {
  const cat = one(q.category), tier = one(q.tier), flag = one(q.flag), result = one(q.result), wallet = one(q.wallet)?.toLowerCase();
  return {
    category: cat && isCategory(cat) ? cat : null,
    tier: tier === "millionaire" || tier === "pro" || tier === "new" ? tier : null,
    flag: (FLAGS as readonly string[]).includes(flag ?? "") ? (flag as Flag) : null,
    result: (RESULTS as readonly string[]).includes(result ?? "") ? (result as Result) : null,
    wallet: wallet && /^0x[0-9a-f]{40}$/.test(wallet) ? wallet : null,
    from: isDate(one(q.from)) ? one(q.from)! : etDate(now - 30 * DAY),
    to: isDate(one(q.to)) ? one(q.to)! : etDate(now),
  };
}

/** The filter as a query string (for links, paging and the CSV). */
export function filterQuery(f: RecordFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ category: f.category, tier: f.tier, flag: f.flag, result: f.result, wallet: f.wallet, from: f.from, to: f.to, ...extra })) if (v) p.set(k, v);
  return p.toString();
}

function where(f: RecordFilter): SQL {
  const w: SQL[] = [
    sql`r.flagged_at >= (${f.from}::date)::timestamp at time zone 'America/New_York'`,
    sql`r.flagged_at < ((${f.to}::date + 1)::timestamp at time zone 'America/New_York')`,
  ];
  if (f.category) w.push(sql`r.category = ${f.category}`);
  if (f.tier) w.push(sql`r.tier = ${f.tier}`);
  if (f.flag) w.push(sql`${f.flag} = any(r.flags)`);
  if (f.wallet) w.push(sql`r.wallet = ${f.wallet}`);
  if (f.result) w.push(f.result === "open" ? sql`r.result is null` : sql`r.result = ${f.result}`);
  return sql.join(w.map(x => sql`(${x})`), sql` and `);
}

/** A row as stored (members, the CSV). */
export interface RecordRow {
  id: string; flaggedAt: number; flags: string[]; marketId: string; market: string; category: string; categoryName: string;
  tier: string; wallet: string | null; short: string | null; outcome: string; side: "yes" | "no"; entryPrice: number; size: number;
  priceNow: number | null; priceAt: number | null; exitPrice: number | null; result: Result;
  /** Price now (or settle, or exit) minus entry, in cents; null with no price yet. */
  moveCents: number | null;
  verify: BetVerify;
}

const SELECT = sql`select r.*, coalesce(tw.kalshi_url, r.kalshi_url) as kalshi from terminal.record_log r
  left join terminal.market_twins tw on tw.polymarket_id = r.market_id and tw.status = 'approved'`;

function toRow(x: Record<string, unknown>): RecordRow {
  const t = (v: unknown) => (v ? new Date(v as string).getTime() : null);
  const result: Result = x.result === "won" || x.result === "lost" || x.result === "sold" || x.result === "void" ? x.result : "open";
  const entry = Number(x.entry_price), now = x.price_now === null || x.price_now === undefined ? null : Number(x.price_now);
  const exit = x.exit_price === null || x.exit_price === undefined ? null : Number(x.exit_price);
  const mark = result === "sold" ? exit : now;
  const cat = String(x.category);
  const wallet = x.wallet ? String(x.wallet) : null;
  return {
    id: String(x.id), flaggedAt: t(x.flagged_at)!, flags: (x.flags as string[]) ?? [], marketId: String(x.market_id), market: String(x.market_title),
    category: cat, categoryName: isCategory(cat) ? categoryInfo(cat).name : cat, tier: String(x.tier), wallet, short: wallet ? shortWallet(wallet) : null,
    outcome: String(x.outcome), side: x.outcome_side === "no" ? "no" : "yes", entryPrice: entry, size: Number(x.size),
    priceNow: now, priceAt: t(x.price_at), exitPrice: exit, result,
    moveCents: mark === null ? null : Math.round(mark * 100) - Math.round(entry * 100),
    verify: { tx: (x.transaction_hash as string | null) ?? null, address: wallet, kalshi: (x.kalshi as string | null) ?? null, polymarket: Boolean(x.market_url),
      fetchedAt: t(x.price_at) ?? t(x.fetched_at), locked: false },
  };
}

/** What a viewer may see of a row: an open position's side, prices, move and on-chain links are for members only. */
export interface RecordView extends Omit<RecordRow, "outcome" | "side" | "entryPrice" | "priceNow" | "exitPrice" | "moveCents"> {
  outcome: string | null; side: "yes" | "no" | null; entryPrice: number | null; priceNow: number | null; exitPrice: number | null; moveCents: number | null;
}
export function recordView(r: RecordRow, member: boolean): RecordView {
  if (member) return r;
  // The wallet's address page lists all its trades, open ones included: never a visitor's, even on a settled row.
  if (r.result !== "open") return { ...r, wallet: null, verify: { ...r.verify, address: null } };
  return { ...r, outcome: null, side: null, entryPrice: null, priceNow: null, exitPrice: null, moveCents: null, wallet: null,
    verify: { ...r.verify, tx: null, address: null, locked: true } };
}

export interface RecordSummary { logged: number; settled: number; won: number; lost: number; sold: number; open: number; void: number;
  /** Won over won + lost (markets that settled), 0..1; null with none settled. */
  wonShare: number | null;
  /** The median of every priced row's move since it was flagged, in cents; null with none priced. */
  medianMove: number | null }

/** The summary of every row in the filter. */
export async function recordSummary(db: Db, f: RecordFilter): Promise<RecordSummary> {
  const r = (await db.execute(sql`select count(*)::int as logged,
      count(*) filter (where r.result = 'won')::int as won, count(*) filter (where r.result = 'lost')::int as lost,
      count(*) filter (where r.result = 'sold')::int as sold, count(*) filter (where r.result = 'void')::int as void, count(*) filter (where r.result is null)::int as open,
      percentile_cont(0.5) within group (order by round(coalesce(case when r.result = 'sold' then r.exit_price else r.price_now end, null) * 100) - round(r.entry_price * 100))
        filter (where coalesce(case when r.result = 'sold' then r.exit_price else r.price_now end, null) is not null) as median
    from terminal.record_log r where ${where(f)}`)).rows[0] as Record<string, unknown>;
  const won = Number(r.won), lost = Number(r.lost);
  return { logged: Number(r.logged), settled: won + lost, won, lost, sold: Number(r.sold), open: Number(r.open), void: Number(r.void),
    wonShare: won + lost ? won / (won + lost) : null, medianMove: r.median === null || r.median === undefined ? null : Number(r.median) };
}

export const PAGE_SIZE = 100;

export async function recordRows(db: Db, f: RecordFilter, o: { page?: number; all?: boolean } = {}): Promise<RecordRow[]> {
  const page = Math.max(1, o.page ?? 1);
  const r = await db.execute(sql`${SELECT} where ${where(f)} order by r.flagged_at desc, r.id ${o.all ? sql`` : sql`limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}`}`);
  return (r.rows as Array<Record<string, unknown>>).map(toRow);
}

/** The categories the filter offers (every category, by name). */
export const CATEGORY_OPTIONS = CATEGORIES.map(c => ({ value: c.slug, label: c.name }));

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "2026-11-08 14:05 ET". */
export const etStamp = (ms: number): string => {
  const p = ET_TIME.formatToParts(new Date(ms)), g = (k: string) => p.find(x => x.type === k)!.value;
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")} ET`;
};

/** The CSV of rows (members): one line per position, every column the page shows plus the sources. */
export function toCsv(rows: readonly RecordRow[]): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["flagged_et", "market", "category", "tier", "wallet", "flags", "side", "entry_price", "size_usd", "price_now_or_settle", "exit_price", "move_cents", "result", "transaction", "wallet_polygonscan", "kalshi", "price_fetched_et"];
  const lines = rows.map(r => [etStamp(r.flaggedAt), r.market, r.categoryName, TIER_NAME[r.tier] ?? r.tier, r.short ?? "", r.flags.join(" "), r.outcome,
    r.entryPrice.toFixed(4), r.size.toFixed(2), r.result === "sold" ? "" : r.priceNow?.toFixed(4) ?? "", r.exitPrice?.toFixed(4) ?? "", r.moveCents ?? "", r.result === "open" ? "Open" : r.result[0]!.toUpperCase() + r.result.slice(1),
    r.verify.tx ? `https://polygonscan.com/tx/${r.verify.tx}` : "Source pending", r.verify.address ? `https://polygonscan.com/address/${r.verify.address}` : "", r.verify.kalshi ?? "",
    r.verify.fetchedAt ? etStamp(r.verify.fetchedAt) : ""].map(esc).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

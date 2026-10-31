/* Research's read-only tools (lib/research/run.ts): each takes plain arguments, reads Insidir's own data on the
 * viewer's clock (visitors 30 minutes late) and returns a table: its rows with artwork and links, the sources, and
 * when it was read. Nothing writes; nothing reaches outside the database. Arguments are checked here, never trusted.
 *   find_positions   large positions by market, league, tracker, size, time, open/settled, from winning trackers,
 *                    starting within N hours
 *   list_trackers    trackers by followable ROI, settled count or 30-day volume
 *   tracker_holdings what one tracker holds now
 *   account_record   one account's settled large positions and record, by league, topic or market type
 *   insider_filings  Form 4 purchases (or sales) by role, size, recency or ticker
 *   find_markets     markets with large-position money, by words in the title */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves as movesT } from "@/lib/db/schema";
import { liveTabs } from "@/lib/features";
import { hundredLine, MIN_SETTLED, roiText } from "@/lib/follow/math";
import { artOfMove, type MoveArt } from "@/lib/logos";
import { dollars } from "@/lib/money";
import { notComboSql } from "@/lib/moves/combos";
import { headlineOf, sublineOf } from "@/lib/moves/headline";
import { leagueLabel } from "@/lib/moves/leagues";
import { walletLabel } from "@/lib/moves/records";
import { fromRow } from "@/lib/moves/store";
import { LEAGUES, type League, type Move } from "@/lib/moves/types";
import { companyHref } from "@/lib/profiles/name";
import { TRACKERS, trackerBySlug, trackerWhere, visibleTrackers, type TrackerGroup } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";
import { isReady } from "@/lib/features";
import type { ToolDef } from "@/lib/analyst/llm";

export interface Cell { text: string; href?: string; art?: MoveArt; tone?: "pos" | "neg" }
export interface Table {
  tool: string;
  title: string;
  columns: string[];
  /** Which columns are figures (right-aligned, tabular). */
  numeric: number[];
  rows: Cell[][];
  sources: Array<{ label: string; href: string }>;
  at: number;
  live: boolean;
  /** A line under the table: what it leaves out, or what isn't in Insidir's data. */
  note?: string | null;
}
export interface ToolCtx { db: Db; now: number; until: number; live: boolean; wallet?: string | null }

const T = sql`terminal.moves`;
const DAY = 86_400_000;
const SRC = { polymarket: { label: "Polymarket (Polygonscan)", href: "https://polygonscan.com" }, kalshi: { label: "Kalshi", href: "https://kalshi.com" }, sec: { label: "SEC EDGAR", href: "https://www.sec.gov/edgar/search/" }, method: { label: "Methodology", href: "/methodology" } };

/* ---------- argument checks ---------- */
type Args = Record<string, unknown>;
const num = (a: Args, k: string, lo: number, hi: number): number | undefined => { const v = Number(a[k]); return a[k] === undefined || a[k] === null || !Number.isFinite(v) ? undefined : Math.min(hi, Math.max(lo, v)); };
const str = (a: Args, k: string, max = 80): string | undefined => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string).trim().slice(0, max) : undefined);
const oneOf = <T extends string>(a: Args, k: string, allowed: readonly T[]): T | undefined => (allowed as readonly string[]).includes(String(a[k] ?? "")) ? (a[k] as T) : undefined;
const bool = (a: Args, k: string): boolean => a[k] === true || a[k] === "true";
const LEAGUE_WORDS: Record<string, League> = { nfl: "NFL", nba: "NBA", mlb: "MLB", nhl: "NHL", college: "college", ncaa: "college", soccer: "soccer", football: "soccer", ufc: "UFC", mma: "UFC", tennis: "tennis", golf: "golf" };
const leagueArg = (a: Args): League | undefined => { const v = str(a, "league")?.toLowerCase(); if (!v) return undefined; return LEAGUE_WORDS[v] ?? (LEAGUES as readonly string[]).find(l => l.toLowerCase() === v) as League | undefined; };

/* ---------- rows ---------- */
const ago = (ms: number, now: number) => { const m = Math.max(1, Math.round((now - ms) / 60_000)); return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
function positionRow(m: Move, now: number): Cell[] {
  const who = m.wallet ? { text: walletLabel(m.wallet, m.walletName), href: `/p/${m.wallet}` } : { text: m.source === "sec" && m.detail?.kind === "insider" ? m.detail.ownerName : "Anonymous" };
  return [
    { text: headlineOf(m), href: `/position/${encodeURIComponent(m.id)}`, art: artOfMove(m) },
    { text: m.source === "sec" ? (m.detail?.kind === "insider" ? m.detail.company : "SEC") : sublineOf({ ...m, leagueLabel: leagueLabel(m) }) },
    who,
    { text: dollars(m.amount) },
    { text: m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : m.result === "void" ? "Void" : "Open", tone: m.result === "won" ? "pos" : m.result === "lost" ? "neg" : undefined },
    { text: ago(m.at, now) },
  ];
}
const POS_COLS = ["Position", "Market", "Account", "Amount", "Status", "When"];
const sourcesOf = (ms: Move[]) => [...new Set(ms.map(m => m.source))].map(s => SRC[s as keyof typeof SRC] ?? SRC.method);

/** Trackers with a positive followable return on 30+ settled. */
async function winningTrackers(db: Db, now: number): Promise<string[]> {
  const stats = await trackerStats(db, now);
  return TRACKERS.filter(t => t.kind === "bets").filter(t => { const r = stats.get(t.slug)?.records.all; return r && r.won + r.lost >= MIN_SETTLED && r.net > 0; }).map(t => t.slug);
}

/* ---------- the tools ---------- */
async function findPositions(c: ToolCtx, a: Args): Promise<Table> {
  const tab = oneOf(a, "tab", ["sports", "markets", "stocks"] as const);
  const league = leagueArg(a);
  const tracker = str(a, "tracker") ? trackerBySlug(str(a, "tracker")!) : null;
  const min = num(a, "min_amount", 0, 1e9);
  const hours = num(a, "since_hours", 1, 24 * 90) ?? 24 * 7;
  const status = oneOf(a, "status", ["open", "settled", "any"] as const) ?? "any";
  const starts = num(a, "starts_within_hours", 1, 24 * 7);
  const limit = num(a, "limit", 1, 50) ?? 20;
  const winners = bool(a, "winning_trackers_only") ? await winningTrackers(c.db, c.now) : null;
  const wallet = str(a, "wallet") === "this" ? c.wallet ?? undefined : str(a, "wallet");
  const w: SQL[] = [sql`${T}.hidden_at is null`, notComboSql, sql`${T}.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)})`, sql`${T}.at <= ${new Date(c.until)}`, sql`${T}.at > ${new Date(c.now - hours * 3_600_000)}`];
  if (tab) w.push(sql`${T}.tab = ${tab}`);
  if (league) w.push(sql`${T}.league = ${league}`);
  if (tracker) w.push(trackerWhere(tracker));
  if (min) w.push(sql`${T}.amount >= ${min}`);
  if (wallet) w.push(sql`${T}.wallet = ${wallet.toLowerCase()}`);
  if (status === "open") w.push(sql`${T}.result is null`);
  if (status === "settled") w.push(sql`${T}.result is not null`);
  if (winners) w.push(winners.length ? sql`${T}.trackers && array[${sql.join(winners.map(s => sql`${s}`), sql`, `)}]::text[]` : sql`false`);
  if (starts) w.push(sql`exists (select 1 from terminal.market_info i where i.source = ${T}.source and i.market_id = ${T}.market_id and i.start_at > ${new Date(c.now)} and i.start_at <= ${new Date(c.now + starts * 3_600_000)})`);
  const rows = (await c.db.select().from(movesT).where(sql.join(w, sql` and `)).orderBy(sql`${T}.amount desc`).limit(limit)).map(fromRow);
  const bits = [status !== "any" ? status : null, league ?? tab ?? null, tracker ? tracker.name : null, winners ? "from winning trackers" : null, starts ? `starting within ${starts} hours` : null, min ? `${dollars(min)}+` : null].filter(Boolean);
  return { tool: "find_positions", title: `Large positions${bits.length ? `: ${bits.join(", ")}` : ""}`, columns: POS_COLS, numeric: [3], rows: rows.map(m => positionRow(m, c.now)), sources: [...sourcesOf(rows), SRC.method], at: c.until, live: c.live,
    note: winners && !winners.length ? "No tracker has a positive followable return on 30+ settled yet." : null };
}

async function listTrackers(c: ToolCtx, a: Args): Promise<Table> {
  const group = oneOf(a, "group", ["Leagues", "Topics", "Styles", "Stocks"] as const satisfies readonly TrackerGroup[]);
  const sort = oneOf(a, "sort", ["roi", "settled", "volume"] as const) ?? "roi";
  const positive = bool(a, "positive_only");
  const limit = num(a, "limit", 1, 40) ?? 10;
  const stats = await trackerStats(c.db, c.now);
  const list = visibleTrackers(isReady).filter(t => !group || t.group === group).map(t => {
    const s = stats.get(t.slug), r = s?.records.all, n = r ? r.won + r.lost : 0;
    return { t, s, r, n, roi: r && n >= MIN_SETTLED && (r.staked ?? 0) > 0 ? r.net / r.staked! : null };
  }).filter(x => (sort === "roi" ? x.roi !== null : true) && (!positive || (x.roi ?? 0) > 0))
    .sort((x, y) => sort === "roi" ? y.roi! - x.roi! : sort === "settled" ? y.n - x.n : (y.s?.tracked30d ?? 0) - (x.s?.tracked30d ?? 0)).slice(0, limit);
  return {
    tool: "list_trackers", title: `Trackers by ${sort === "roi" ? "followable ROI (30+ settled)" : sort === "settled" ? "settled positions" : "30-day volume"}${group ? `: ${group}` : ""}`,
    columns: ["Tracker", "Followable ROI", "$100 line", "Record", "Volume, 30 days"], numeric: [1, 3, 4],
    rows: list.map(x => [
      { text: x.t.name, href: `/trackers/${x.t.slug}` },
      x.roi !== null ? { text: roiText(x.r!.net, x.r!.staked!), tone: x.r!.net >= 0 ? "pos" as const : "neg" as const } : { text: x.t.kind === "filings" ? "Filings" : `Building · ${x.n} of 30` },
      { text: x.roi !== null ? hundredLine({ net: x.r!.net, staked: x.r!.staked! }) : "—" },
      { text: x.r ? `${x.r.won}–${x.r.lost}` : "—" },
      { text: dollars(x.s?.tracked30d ?? 0) },
    ]),
    sources: [SRC.method], at: c.now, live: c.live, note: "Past results, not a promise.",
  };
}

async function trackerHoldingsTool(c: ToolCtx, a: Args): Promise<Table> {
  const t = str(a, "tracker") ? trackerBySlug(str(a, "tracker")!) : null;
  if (!t) return { tool: "tracker_holdings", title: "Tracker holdings", columns: POS_COLS, numeric: [3], rows: [], sources: [SRC.method], at: c.until, live: c.live, note: "No tracker by that name." };
  const rows = (await c.db.select().from(movesT).where(sql`${trackerWhere(t)} and ${T}.hidden_at is null and ${notComboSql} and ${T}.result is null and ${T}.at <= ${new Date(c.until)} and ${T}.at > ${new Date(c.now - 60 * DAY)}`)
    .orderBy(sql`${T}.amount desc`).limit(num(a, "limit", 1, 50) ?? 20)).map(fromRow);
  return { tool: "tracker_holdings", title: `${t.name}: holding now`, columns: POS_COLS, numeric: [3], rows: rows.map(m => positionRow(m, c.now)), sources: [...sourcesOf(rows), SRC.method], at: c.until, live: c.live };
}

async function accountRecord(c: ToolCtx, a: Args): Promise<Table> {
  const raw = str(a, "wallet");
  const wallet = (raw === "this" || !raw ? c.wallet : raw)?.toLowerCase() ?? null;
  const league = leagueArg(a);
  const category = str(a, "category")?.toLowerCase();
  const type = oneOf(a, "market_type", ["totals", "spreads", "moneyline"] as const);
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) return { tool: "account_record", title: "Account record", columns: POS_COLS, numeric: [3], rows: [], sources: [SRC.method], at: c.until, live: c.live, note: "Open an account's page to ask about its record." };
  const w: SQL[] = [sql`${T}.wallet = ${wallet}`, sql`${T}.hidden_at is null`, sql`${T}.result in ('won', 'lost')`, sql`${T}.at <= ${new Date(c.until)}`];
  if (league) w.push(sql`${T}.league = ${league}`);
  if (category) w.push(sql`${T}.category = ${category}`);
  if (type === "totals") w.push(sql`${T}.market_title ~* '(o/u|over/under|total)'`);
  if (type === "spreads") w.push(sql`${T}.market_title ~* '(spread|wins by over|\\(-?[0-9])'`);
  if (type === "moneyline") w.push(sql`${T}.market_title !~* '(o/u|over/under|total|spread|wins by over)'`);
  const rows = (await c.db.select().from(movesT).where(sql.join(w, sql` and `)).orderBy(sql`${T}.settled_at desc nulls last`).limit(num(a, "limit", 1, 50) ?? 30)).map(fromRow);
  const won = rows.filter(m => m.result === "won").length, lost = rows.length - won;
  const name = rows[0] ? walletLabel(wallet, rows[0].walletName) : walletLabel(wallet, null);
  const scope = [league, category, type].filter(Boolean).join(" ");
  return { tool: "account_record", title: `${name}: ${scope ? `${scope} ` : ""}record ${won}–${lost}`, columns: POS_COLS, numeric: [3], rows: rows.map(m => positionRow(m, c.now)), sources: [{ label: `${name} on Insidir`, href: `/p/${wallet}` }, SRC.polymarket], at: c.until, live: c.live,
    note: "Settled large positions Insidir tracked from this account, newest first. Past results, not a promise." };
}

async function insiderFilings(c: ToolCtx, a: Args): Promise<Table> {
  const role = oneOf(a, "role", ["ceo", "cfo", "director", "officer", "any"] as const) ?? "any";
  const min = num(a, "min_value", 0, 1e11) ?? 0;
  const days = num(a, "since_days", 1, 365) ?? 30;
  const ticker = str(a, "ticker", 10)?.toUpperCase();
  const code = oneOf(a, "kind", ["purchase", "sale"] as const) === "sale" ? "S" : "P";
  const roleSql = role === "ceo" ? sql`role ~* '(ceo|chief executive)'` : role === "cfo" ? sql`role ~* '(cfo|chief financial)'` : role === "director" ? sql`role ~* 'director'` : role === "officer" ? sql`role ~* '(officer|chief|president|vp)'` : sql`true`;
  const r = await c.db.execute(sql`select accession, max(owner_name) as owner, max(role) as role, max(company) as company, max(ticker) as ticker, sum(value)::float as value, max(filed_at) as filed_at, max(url) as url
    from terminal.insider_trades where code = ${code} and ${roleSql} and filed_at > ${new Date(c.now - days * DAY)} and filed_at <= ${new Date(c.until)}
      ${ticker ? sql`and upper(ticker) = ${ticker}` : sql``}
    group by accession having sum(value) >= ${min} order by sum(value) desc limit ${num(a, "limit", 1, 50) ?? 20}`);
  const rows = r.rows as Array<{ owner: string; role: string; company: string; ticker: string | null; value: number; filed_at: string; url: string }>;
  return {
    tool: "insider_filings", title: `Insider ${code === "P" ? "purchases" : "sales"}${role !== "any" ? ` by ${role.toUpperCase()}s` : ""}${min ? ` over ${dollars(min)}` : ""}, last ${days} days`,
    columns: ["Company", "Insider", "Role", "Value", "Filed"], numeric: [3],
    rows: rows.map(x => [
      { text: x.ticker ? `${x.company} (${x.ticker})` : x.company, ...(x.ticker ? { href: companyHref(x.ticker), art: { kind: "logo", src: `/logos/stocks/${x.ticker}.webp` } as MoveArt } : {}) },
      { text: x.owner }, { text: x.role }, { text: dollars(Number(x.value)) },
      { text: new Date(x.filed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }), href: x.url },
    ]),
    sources: [SRC.sec], at: c.until, live: c.live, note: a.by_sector ? "Sector isn't in Insidir's data; the filings are listed by size." : null,
  };
}

async function findMarkets(c: ToolCtx, a: Args): Promise<Table> {
  const q = str(a, "query", 60);
  const r = await c.db.execute(sql`select market_id, source, max(market_title) as title, max(event_title) as event, sum(amount)::float as money, count(*)::int as n, max(at) as last_at
    from terminal.moves where hidden_at is null and source in ('polymarket', 'kalshi') and at <= ${new Date(c.until)} and at > ${new Date(c.now - 30 * DAY)}
      ${q ? sql`and (market_title ilike ${`%${q.replace(/[%_]/g, "")}%`} or event_title ilike ${`%${q.replace(/[%_]/g, "")}%`})` : sql``}
    group by market_id, source order by sum(amount) desc limit ${num(a, "limit", 1, 30) ?? 15}`);
  const rows = r.rows as Array<{ market_id: string; source: string; title: string; event: string; money: number; n: number }>;
  return { tool: "find_markets", title: `Markets by large-position money, 30 days${q ? `: "${q}"` : ""}`, columns: ["Market", "Venue", "Large positions", "Money"], numeric: [2, 3],
    rows: rows.map(x => [{ text: x.title, href: `/market/${encodeURIComponent(x.market_id)}` }, { text: x.source === "polymarket" ? "Polymarket" : "Kalshi" }, { text: String(x.n) }, { text: dollars(Number(x.money)) }]),
    sources: [SRC.polymarket, SRC.kalshi], at: c.until, live: c.live };
}

export const TOOLS: Record<string, (c: ToolCtx, a: Args) => Promise<Table>> = {
  find_positions: findPositions, list_trackers: listTrackers, tracker_holdings: trackerHoldingsTool, account_record: accountRecord, insider_filings: insiderFilings, find_markets: findMarkets,
};

const slugs = TRACKERS.map(t => t.slug);
/** The tools as the model sees them. */
export const TOOL_DEFS: ToolDef[] = [
  { type: "function", function: { name: "find_positions", description: "Large positions Insidir tracked on Polymarket, Kalshi and SEC filings.", parameters: { type: "object", additionalProperties: false, properties: {
    tab: { type: "string", enum: ["sports", "markets", "stocks"] }, league: { type: "string", enum: [...LEAGUES] }, tracker: { type: "string", enum: slugs },
    min_amount: { type: "number" }, since_hours: { type: "number" }, status: { type: "string", enum: ["open", "settled", "any"] }, winning_trackers_only: { type: "boolean", description: "Only positions held by trackers with a positive followable ROI on 30+ settled" },
    starts_within_hours: { type: "number", description: "Only markets whose event starts within this many hours (tonight: 12)" }, wallet: { type: "string", description: "A 0x account, or 'this' for the account on the current page" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "list_trackers", description: "Insidir's trackers with their followable records.", parameters: { type: "object", additionalProperties: false, properties: {
    group: { type: "string", enum: ["Leagues", "Topics", "Styles", "Stocks"] }, sort: { type: "string", enum: ["roi", "settled", "volume"] }, positive_only: { type: "boolean" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "tracker_holdings", description: "What one tracker holds now.", parameters: { type: "object", additionalProperties: false, required: ["tracker"], properties: { tracker: { type: "string", enum: slugs }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "account_record", description: "One Polymarket account's settled large positions and record.", parameters: { type: "object", additionalProperties: false, properties: {
    wallet: { type: "string", description: "A 0x account, or 'this' for the account on the current page" }, league: { type: "string", enum: [...LEAGUES] }, category: { type: "string" },
    market_type: { type: "string", enum: ["totals", "spreads", "moneyline"] }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "insider_filings", description: "SEC Form 4 open-market purchases or sales by company insiders.", parameters: { type: "object", additionalProperties: false, properties: {
    role: { type: "string", enum: ["ceo", "cfo", "director", "officer", "any"] }, min_value: { type: "number" }, since_days: { type: "number" }, ticker: { type: "string" },
    kind: { type: "string", enum: ["purchase", "sale"] }, by_sector: { type: "boolean", description: "Set when the question asks by sector (Insidir has no sector data)" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "find_markets", description: "Markets with the most large-position money in 30 days, optionally matching words in the title.", parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string" }, limit: { type: "number" } } } } },
];

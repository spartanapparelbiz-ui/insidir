/* A position's facts, computed deterministically from Insidir's own data (SQL over terminal.moves, trader_records,
 * market_info, insider_trades and stock_closes). The analyst note may say only what is here: every number in a note
 * must appear in some fact's text, every name in `names`. Each fact carries the link it comes from.
 *   bets     size; rank among the account's positions this month; size vs. their median; their verified record; their
 *            record and followable ROI in this league or topic; proven accounts on the same side and their money; the
 *            price since entry; time since and to the start; earlier positions in this market; its share of the
 *            market's large-position money in 24 hours.
 *   insiders the purchase; the insider's earlier purchases at the company; how many insiders bought in 30 days; the
 *            price since the filing.
 * buildBetFacts / buildInsiderFacts are pure (tested); factsFor reads the database. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { roiText } from "@/lib/follow/math";
import { dollars } from "@/lib/money";
import { headlineOf } from "@/lib/moves/headline";
import { leagueLabel } from "@/lib/moves/leagues";
import { RECORD_MIN_RESOLVED, walletLabel } from "@/lib/moves/records";
import { moveSource } from "@/lib/moves/source";
import type { Move } from "@/lib/moves/types";
import type { Fact, Facts } from "./types";

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
/** "40 minutes", "3 hours", "2 days". */
export function span(min: number): string {
  const m = Math.max(1, Math.round(min));
  if (m < 120) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}
const methodology = { label: "How it's computed", href: "/methodology#analyst-notes" };

export interface BetRaw {
  move: Move;
  /** The account's positions: median size, this one's rank by size in the last 30 days, how many there were. */
  median: number | null;
  monthRank: number | null;
  monthCount: number;
  /** trader_records: settled markets (verified from their own positions). */
  record: { resolved: number; won: number; lost: number } | null;
  /** Their large positions in this league or topic that settled, and the followable record of those. */
  scope: string | null;
  scopeWon: number;
  scopeLost: number;
  scopeFollow: { n: number; net: number; staked: number } | null;
  /** Other accounts with a verified, profitable record on the same side of this market. */
  proven: { n: number; amount: number };
  /** Their earlier large positions in this market. */
  prior: number;
  /** The side's price now (0..1), from the venue. */
  nowPrice: number | null;
  /** Minutes since the position, and to the event's start (null when unknown or started). */
  minutesSince: number;
  minutesToStart: number | null;
  /** Large-position money on this market in the last 24 hours, this one included. */
  market24h: number;
}

export function buildBetFacts(r: BetRaw, now: number): Facts {
  const m = r.move, f: Fact[] = [];
  const who = m.wallet ? walletLabel(m.wallet, m.walletName) : null;
  const src = moveSource(m);
  const venue = m.source === "polymarket" ? "Polymarket" : "Kalshi";
  const profile = m.wallet ? { label: `${who} on Insidir`, href: `/p/${m.wallet}` } : null;
  const outcome = headlineOf(m);
  f.push({ key: "position", label: "The position", text: `${dollars(m.amount)} on ${outcome}`, source: src ? { label: src.label, href: src.href } : null });
  if (who) f.push({ key: "account", label: "Account", text: who, source: profile });
  else f.push({ key: "account", label: "Account", text: `Anonymous (${venue} trades carry no account)`, source: src ? { label: src.label, href: src.href } : null });
  if (r.monthRank && r.monthCount >= 3 && r.monthRank <= 10) {
    f.push({ key: "rank", label: "Size among their positions, last 30 days", text: r.monthRank === 1 ? "largest position this month" : `${ORD(r.monthRank)}-largest position this month`, source: profile });
  }
  if (r.median && r.median > 0 && m.amount / r.median >= 1.5) f.push({ key: "vs_median", label: "Size vs. their median position", text: `${(m.amount / r.median).toFixed(1)}× their median`, source: profile });
  if (r.record && r.record.resolved >= RECORD_MIN_RESOLVED) f.push({ key: "record", label: "Verified record, every settled market", text: `${r.record.won}–${r.record.lost}`, source: profile });
  if (r.scope && r.scopeWon + r.scopeLost >= 5) f.push({ key: "scope_record", label: `Their ${r.scope} record (large positions)`, text: `${r.scope} record: ${r.scopeWon}–${r.scopeLost}`, source: profile });
  if (r.scope && r.scopeFollow && r.scopeFollow.n >= 10 && r.scopeFollow.staked > 0) f.push({ key: "scope_roi", label: `Followable ROI on their ${r.scope} positions`, text: `followable ROI ${roiText(r.scopeFollow.net, r.scopeFollow.staked)}`, source: methodology });
  if (r.proven.n > 0) f.push({ key: "proven", label: "Proven accounts on the same side", text: `${r.proven.n} proven ${r.proven.n === 1 ? "account" : "accounts"} with ${dollars(r.proven.amount)}`, source: methodology });
  const entry = m.avgPrice;
  if (r.nowPrice !== null && entry > 0 && entry < 1 && !m.result) {
    const pts = Math.round((r.nowPrice - entry) * 100);
    f.push({ key: "price_move", label: "Price on their side since", text: pts === 0 ? "price unchanged" : `${Math.abs(pts)} ${Math.abs(pts) === 1 ? "point" : "points"} ${pts > 0 ? "their way" : "against them"}`, source: src ? { label: src.label, href: src.href } : null });
  }
  f.push({ key: "since", label: "Time since the position", text: `${span(r.minutesSince)} since`, source: null });
  if (r.minutesToStart !== null && r.minutesToStart > 0 && r.minutesToStart < 7 * 24 * 60) f.push({ key: "to_start", label: "Time to the start", text: `${span(r.minutesToStart)} before the start`, source: src ? { label: src.label, href: src.href } : null });
  if (r.prior > 0) f.push({ key: "prior", label: "Their earlier large positions in this market", text: `${r.prior} earlier ${r.prior === 1 ? "position" : "positions"} in this market`, source: profile });
  if (r.market24h > m.amount * 1.05) {
    const pct = Math.round((m.amount / r.market24h) * 100);
    if (pct >= 10) f.push({ key: "share_24h", label: "Share of the large-position money on this market, 24 hours", text: `${pct}% of the large-position money here in 24 hours`, source: { label: "This market on Insidir", href: `/market/${encodeURIComponent(m.marketId)}` } });
  }
  const scope = r.scope ? [r.scope] : [];
  const lg = leagueLabel(m);
  return { moveId: m.id, kind: "bet", names: [...new Set([...(who ? [who] : []), venue, ...scope, ...(lg ? [lg] : []), m.outcome, outcome, m.marketTitle, m.eventTitle].filter(Boolean))], facts: f, at: now };
}

export interface InsiderRaw {
  move: Move;
  /** The insider's earlier open-market purchases at this company. */
  priorBuys: number;
  /** Distinct insiders who bought this company's stock in the 30 days to this filing. */
  cluster: number;
  /** The last close vs. the price they paid (0.12 is +12%), null without prices. */
  priceSince: number | null;
}

export function buildInsiderFacts(r: InsiderRaw, now: number): Facts {
  const m = r.move, d = m.detail;
  if (d?.kind !== "insider") return { moveId: m.id, kind: "insider", names: [], facts: [], at: now };
  const s = moveSource(m);
  const filing = s ? { label: s.label, href: s.href } : { label: "SEC EDGAR", href: "https://www.sec.gov/edgar/search/" };
  const f: Fact[] = [
    { key: "purchase", label: "The purchase", text: `${dollars(m.amount)} of ${d.company} stock`, source: filing },
    { key: "insider", label: "Who", text: `${d.ownerName}, ${d.role}`, source: filing },
  ];
  f.push({ key: "prior", label: "Their earlier purchases at the company", text: r.priorBuys === 0 ? "first open-market purchase on file" : `${r.priorBuys} earlier ${r.priorBuys === 1 ? "purchase" : "purchases"} on file`, source: d.ticker ? { label: `${d.ticker} insider trades`, href: `/insider-trading/${d.ticker}` } : filing });
  if (r.cluster >= 2) f.push({ key: "cluster", label: "Insiders buying in 30 days", text: `${r.cluster} insiders bought in 30 days`, source: d.ticker ? { label: `${d.ticker} insider trades`, href: `/insider-trading/${d.ticker}` } : filing });
  if (r.priceSince !== null) {
    const p = Math.round(r.priceSince * 1000) / 10;
    f.push({ key: "price_since", label: "Price since the filing", text: `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}% since the filing`, source: { label: "Daily closes", href: "/data" } });
  }
  return { moveId: m.id, kind: "insider", names: [...new Set([d.company, d.ownerName, d.role, ...(d.ticker ? [d.ticker] : [])])], facts: f, at: now };
}

const T = sql`terminal.moves`;
const DAY = 86_400_000;

/** One position's facts, from the database. */
export async function factsFor(db: Db, m: Move, now: number): Promise<Facts> {
  if (m.source === "sec") {
    const d = m.detail;
    if (d?.kind !== "insider") return { moveId: m.id, kind: "fund", names: [], facts: [], at: now };
    const filed = new Date(d.filedAt);
    const r = (await db.execute(sql`select
        (select count(distinct accession)::int from terminal.insider_trades where owner_cik = ${String(d.ownerCik ?? "")} and issuer_cik = ${String(Number(d.issuerCik))} and code = 'P' and filed_at < ${filed}) as prior,
        (select count(distinct owner_cik)::int from terminal.insider_trades where issuer_cik = ${String(Number(d.issuerCik))} and code = 'P' and filed_at <= ${filed} and filed_at > ${new Date(d.filedAt - 30 * DAY)}) as cluster,
        (select close from terminal.stock_closes where ticker = ${(d.ticker ?? "").toUpperCase()} order by date desc limit 1) as close`)).rows[0] as { prior: number; cluster: number; close: number | null };
    return buildInsiderFacts({ move: m, priorBuys: Number(r.prior ?? 0), cluster: Number(r.cluster ?? 0), priceSince: r.close && d.pricePerShare > 0 ? Number(r.close) / d.pricePerShare - 1 : null }, now);
  }
  const scopeSql = m.tab === "sports" && m.league && m.league !== "other" ? sql`${T}.league = ${m.league}` : m.category ? sql`${T}.category = ${m.category}` : sql`false`;
  const scope = m.tab === "sports" ? leagueLabel(m) : m.category ? m.category.charAt(0).toUpperCase() + m.category.slice(1) : null;
  const w = m.wallet;
  const [acct, mk] = await Promise.all([
    w ? db.execute(sql`select
        percentile_cont(0.5) within group (order by ${T}.amount)::float as median,
        count(*) filter (where ${T}.at > ${new Date(now - 30 * DAY)})::int as month_count,
        (count(*) filter (where ${T}.at > ${new Date(now - 30 * DAY)} and ${T}.amount > ${m.amount}) + 1)::int as month_rank,
        count(*) filter (where ${scopeSql} and ${T}.result = 'won')::int as scope_won,
        count(*) filter (where ${scopeSql} and ${T}.result = 'lost')::int as scope_lost,
        count(*) filter (where ${scopeSql} and ${T}.result in ('won','lost') and ${T}.seen_price > 0 and ${T}.seen_price + 0.01::float8 < 1 and ${T}.seen_at < ${T}.settled_at)::int as f_n,
        coalesce(sum(case when ${T}.result = 'won' then 100::float8 / (${T}.seen_price + 0.01::float8) - 100 else -100 end) filter (where ${scopeSql} and ${T}.result in ('won','lost') and ${T}.seen_price > 0 and ${T}.seen_price + 0.01::float8 < 1 and ${T}.seen_at < ${T}.settled_at), 0)::float as f_net,
        count(*) filter (where ${T}.market_id = ${m.marketId} and ${T}.at < ${new Date(m.at)} and ${T}.id <> ${m.id})::int as prior,
        (select row_to_json(r) from (select resolved, won, lost from terminal.trader_records where wallet = ${w}) r) as record
      from ${T} where ${T}.wallet = ${w} and ${T}.hidden_at is null`).then(x => x.rows[0] as Record<string, unknown>) : Promise.resolve(null),
    db.execute(sql`select
        (select case when ${m.outcomeSide} = 'no' then 1 - yes_price else yes_price end from terminal.market_info where source = ${m.source} and market_id = ${m.marketId}) as now_price,
        (select start_at from terminal.market_info where source = ${m.source} and market_id = ${m.marketId}) as start_at,
        coalesce((select sum(amount)::float from ${T} where ${T}.market_id = ${m.marketId} and ${T}.hidden_at is null and ${T}.at > ${new Date(now - DAY)}), 0) as m24,
        (select count(distinct x.wallet)::int from ${T} x join terminal.trader_records r on r.wallet = x.wallet
          where x.market_id = ${m.marketId} and x.outcome_side = ${m.outcomeSide} and x.hidden_at is null and x.wallet is distinct from ${w}
            and r.resolved >= ${RECORD_MIN_RESOLVED} and r.profit > 0) as proven_n,
        coalesce((select sum(x.amount)::float from ${T} x join terminal.trader_records r on r.wallet = x.wallet
          where x.market_id = ${m.marketId} and x.outcome_side = ${m.outcomeSide} and x.hidden_at is null and x.wallet is distinct from ${w}
            and r.resolved >= ${RECORD_MIN_RESOLVED} and r.profit > 0), 0) as proven_amount`).then(x => x.rows[0] as Record<string, unknown>),
  ]);
  const rec = acct?.record as { resolved: number; won: number; lost: number } | null | undefined;
  const fN = Number(acct?.f_n ?? 0);
  const startAt = mk.start_at ? new Date(mk.start_at as string).getTime() : null;
  return buildBetFacts({
    move: m, median: acct?.median == null ? null : Number(acct.median), monthRank: acct ? Number(acct.month_rank) : null, monthCount: Number(acct?.month_count ?? 0),
    record: rec ?? null, scope, scopeWon: Number(acct?.scope_won ?? 0), scopeLost: Number(acct?.scope_lost ?? 0),
    scopeFollow: fN ? { n: fN, net: Number(acct?.f_net ?? 0), staked: fN * 100 } : null,
    proven: { n: Number(mk.proven_n ?? 0), amount: Number(mk.proven_amount ?? 0) }, prior: Number(acct?.prior ?? 0),
    nowPrice: mk.now_price == null ? null : Number(mk.now_price), minutesSince: (now - m.at) / 60_000,
    minutesToStart: startAt && startAt > now ? (startAt - now) / 60_000 : null, market24h: Number(mk.m24 ?? 0),
  }, now);
}

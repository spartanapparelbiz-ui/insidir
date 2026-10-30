/* The home page's four laptops (components/home/Laptops.tsx): a live preview of each market and the proof under it, all
 * from terminal.moves. Sports: the largest positions on the main leagues today (this week when today is quiet), with the
 * entry, the price since and the result once settled. Prediction markets: the largest open positions in the five topic
 * trackers, with entry, price now and the trader's record (members only). Stocks: the latest insider purchases (Form 4),
 * with the price since the filing. Crypto: not live yet, so no rows at all.
 * Visitors see the 3 newest of what's 30 minutes old and how many more; members see every row, live. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { hundredLine, MIN_SETTLED, roiText } from "@/lib/follow/math";
import { liveTabs } from "@/lib/features";
import { artOfMove, type MoveArt } from "@/lib/logos";
import { infoFor } from "@/lib/markets/info";
import { notComboSql } from "@/lib/moves/combos";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { headlineOf, sublineOf } from "@/lib/moves/headline";
import { leagueLabel } from "@/lib/moves/leagues";
import { listMoves } from "@/lib/moves/store";
import type { League, Move } from "@/lib/moves/types";
import { closesFor } from "@/lib/stocks/prices";
import { TRACKERS, type TrackerSlug } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";
import type { Plan, Region } from "@/lib/types";

export type MarketKind = "sports" | "markets" | "stocks" | "crypto";
export const MARKET_KINDS: readonly MarketKind[] = ["sports", "markets", "stocks", "crypto"];
export const isMarketKind = (v: string): v is MarketKind => (MARKET_KINDS as readonly string[]).includes(v);

const DAY = 86_400_000;
const SPORTS: readonly League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "tennis", "UFC"];
export const TOPIC_TRACKERS: readonly TrackerSlug[] = ["elections-2026", "fed-and-rates", "geopolitics", "tech-and-ai", "culture"];
/** Visitors see this many rows; members, up to MEMBER_ROWS. */
export const VISITOR_ROWS = 3;
const MEMBER_ROWS = 40;

export interface PreviewRow {
  id: string;
  art: MoveArt;
  amount: number;
  /** The outcome in plain English, and the market under it. */
  headline: string;
  subline: string;
  ago: string;
  /** Prediction markets: the price on their side when they bought, and now (0..1); null when unknown. */
  entry: number | null;
  now: number | null;
  result: Move["result"];
  /** "Won 41 of 63 · +$1.2M all-time"; members only. */
  record: string | null;
  href: string;
  /** Stocks: who bought, the filing date and the price since it (a fraction: 0.12 is +12%). */
  insider?: string | null;
  filed?: string | null;
  change?: number | null;
}

export interface ProofItem { label: string; value: string; note?: string }

export interface MarketPreview {
  kind: MarketKind;
  rows: PreviewRow[];
  /** Every row there is (a visitor sees VISITOR_ROWS of them). */
  total: number;
  /** "Today" or "This week" (sports widens to the week when today is quiet). */
  window: string;
  proof: ProofItem[];
  live: boolean;
}

const T = sql`terminal.moves`;
const base = (): SQL => sql`${T}.hidden_at is null and ${notComboSql} and ${T}.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)})`;
const volume = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
const topics = (): SQL => sql`${T}.trackers && array[${sql.join(TOPIC_TRACKERS.map(s => sql`${s}`), sql`, `)}]::text[]`;

/** The price on a position's side from the market's YES price. */
const sidePrice = (yes: number | null | undefined, side: Move["outcomeSide"]): number | null => (yes === null || yes === undefined ? null : side === "no" ? 1 - yes : yes);

async function rowsOf(db: Db, moves: Move[], plan: Plan, region: Region | null, now: number): Promise<PreviewRow[]> {
  const items = new Map((await feedItems(db, moves, plan, region, now).catch(() => [])).map(f => [f.id, f]));
  const info = new Map<string, Awaited<ReturnType<typeof infoFor>>>();
  for (const source of ["polymarket", "kalshi"] as const) info.set(source, await infoFor(db, source, moves.filter(m => m.source === source).map(m => m.marketId)).catch(() => new Map()));
  return moves.map(m => {
    const f = items.get(m.id);
    const yes = m.source === "sec" ? null : info.get(m.source)?.get(m.marketId)?.yesPrice ?? null;
    return {
      id: m.id, art: artOfMove(m), amount: m.amount, headline: headlineOf(m), subline: sublineOf({ ...m, leagueLabel: leagueLabel(m) }), ago: f?.ago ?? "",
      entry: m.source === "sec" ? null : m.avgPrice, now: m.result ? null : sidePrice(yes, m.outcomeSide), result: m.result,
      record: f?.record ?? null, href: m.source === "sec" && m.detail?.kind === "insider" && m.detail.ticker ? `/insider-trading/${encodeURIComponent(m.detail.ticker)}` : `/market/${encodeURIComponent(m.marketId)}`,
    };
  });
}

/** One market's preview for this viewer. */
export async function marketPreview(db: Db, kind: MarketKind, plan: Plan, region: Region | null, now: number): Promise<MarketPreview> {
  const p = movePlan(plan);
  const live = p.delayMs === 0;
  const until = now - p.delayMs;
  const limit = live ? MEMBER_ROWS : VISITOR_ROWS;
  if (kind === "crypto") return { kind, rows: [], total: 0, window: "", proof: [], live };

  if (kind === "sports") {
    let window = "Today";
    let all = await listMoves(db, { tab: "sports", leagues: [...SPORTS], since: now - DAY, until, byAmount: true, limit: MEMBER_ROWS }).catch(() => []);
    if (all.length < VISITOR_ROWS) { window = "This week"; all = await listMoves(db, { tab: "sports", leagues: [...SPORTS], since: now - 7 * DAY, until, byAmount: true, limit: MEMBER_ROWS }).catch(() => []); }
    const [rows, vol, stats] = await Promise.all([
      rowsOf(db, all.slice(0, limit), plan, region, now),
      db.execute(sql`select coalesce(sum(${T}.amount), 0)::float as v from ${T} where ${base()} and ${T}.tab = 'sports' and ${T}.at > ${new Date(now - 30 * DAY)}`).then(r => Number((r.rows[0] as { v: number }).v)).catch(() => 0),
      trackerStats(db, now).catch(() => new Map()),
    ]);
    // The best league tracker by followable ROI, among those with a record (30+ settled).
    const best = TRACKERS.filter(t => t.group === "Leagues").map(t => ({ t, r: stats.get(t.slug)?.records.all }))
      .filter(x => x.r && x.r.won + x.r.lost >= MIN_SETTLED && (x.r.staked ?? 0) > 0)
      .sort((a, b) => b.r!.net / b.r!.staked! - a.r!.net / a.r!.staked!)[0];
    const proof: ProofItem[] = [{ label: "Sports volume tracked, last 30 days", value: volume(vol) }];
    if (best) proof.push({ label: `Best sports tracker: ${best.t.name}`, value: `${roiText(best.r!.net, best.r!.staked!)} followable ROI`, note: `${hundredLine({ staked: best.r!.staked!, net: best.r!.net })} ${best.r!.won + best.r!.lost} settled.` });
    return { kind, rows, total: all.length, window, proof, live };
  }

  if (kind === "markets") {
    const all = await listMoves(db, { tab: "markets", where: sql`${topics()} and ${T}.result is null`, since: now - 60 * DAY, until, byAmount: true, limit: MEMBER_ROWS }).catch(() => []);
    const [rows, agg] = await Promise.all([
      rowsOf(db, all.slice(0, limit), plan, region, now),
      db.execute(sql`select coalesce(sum(${T}.amount) filter (where ${T}.at > ${new Date(now - 30 * DAY)}), 0)::float as v,
          count(*) filter (where ${T}.result is null and ${T}.at > ${new Date(now - 60 * DAY)})::int as open
        from ${T} where ${base()} and ${topics()}`).then(r => r.rows[0] as { v: number; open: number }).catch(() => ({ v: 0, open: 0 })),
    ]);
    return { kind, rows, total: all.length, window: "Open now", live,
      proof: [{ label: "Volume on these topics, last 30 days", value: volume(Number(agg.v)) }, { label: "Open positions right now", value: Number(agg.open).toLocaleString("en-US") }] };
  }

  // Stocks: the latest insider purchases, newest filing first.
  const all = await listMoves(db, { tab: "stocks", source: "sec", where: sql`${T}.detail->>'kind' = 'insider'`, since: now - 30 * DAY, until, limit: MEMBER_ROWS }).catch(() => []);
  const shown = all.slice(0, limit);
  const tickers = [...new Set(shown.flatMap(m => (m.detail?.kind === "insider" && m.detail.ticker ? [m.detail.ticker] : [])))];
  const [rows, closes, agg] = await Promise.all([
    rowsOf(db, shown, plan, region, now),
    closesFor(db, tickers, new Date(now - 40 * DAY).toISOString().slice(0, 10)).catch(() => new Map()),
    db.execute(sql`select coalesce(sum(${T}.amount) filter (where ${T}.trackers @> array['ceo-buys']::text[] and ${T}.at > ${new Date(now - 30 * DAY)}), 0)::float as v,
        count(*) filter (where ${T}.detail->>'kind' = 'insider' and ${T}.at > ${new Date(now - 7 * DAY)})::int as week
      from ${T} where ${base()} and ${T}.source = 'sec'`).then(r => r.rows[0] as { v: number; week: number }).catch(() => ({ v: 0, week: 0 })),
  ]);
  const byId = new Map(shown.map(m => [m.id, m]));
  for (const r of rows) {
    const d = byId.get(r.id)?.detail;
    if (d?.kind !== "insider") continue;
    r.insider = d.ownerName;
    r.filed = new Date(d.filedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
    const last = d.ticker ? closes.get(d.ticker)?.at(-1)?.close : undefined;
    r.change = last && d.pricePerShare > 0 ? last / d.pricePerShare - 1 : null;
  }
  return { kind, rows, total: all.length, window: "Latest filings", live,
    proof: [{ label: "CEO purchases, last 30 days", value: volume(Number(agg.v)) }, { label: "Insider purchases filed this week", value: Number(agg.week).toLocaleString("en-US") }] };
}

/** All four, for the home page. */
export async function marketPreviews(db: Db, plan: Plan, region: Region | null, now: number): Promise<Record<MarketKind, MarketPreview>> {
  const out = {} as Record<MarketKind, MarketPreview>;
  for (const k of MARKET_KINDS) out[k] = await marketPreview(db, k, plan, region, now).catch(() => ({ kind: k, rows: [], total: 0, window: "", proof: [], live: movePlan(plan).delayMs === 0 }));
  return out;
}

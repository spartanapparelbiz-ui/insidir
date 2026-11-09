/* The member home's own panels (components/home/Home.tsx), on top of lib/home/data.ts: their watched bets and latest
 * alerts, a wallet they follow, their market, the Daily Brief and the alerts log. Real rows only; every part degrades
 * to null or [] (the panel then says so). Wallets are tier + short address only. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { buildBrief, type Brief } from "@/lib/brief/build";
import { twinOf, type MarketTwin } from "@/lib/entities/market";
import { marketMoney, type MarketMoney } from "@/lib/millionaires/queries";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { followList } from "@/lib/moves/store";
import { listWatched, type WatchedView } from "@/lib/watch/store";
import { walletFacts, type WalletFacts } from "@/lib/briefing/wallets";
import { getBriefing, logTold } from "@/lib/briefing/store";
import { gateBriefing, type GatedBriefing } from "@/lib/briefing/gate";

const DAY = 86_400_000;

export interface ToldRow { id: string; kind: "briefing" | "alert" | "brief"; at: number; marketId: string | null; title: string | null; headline: string; body: string | null; result: "won" | "lost" | "void" | null }
export interface MonitorBet { id: string; at: number; title: string; marketId: string; outcome: string; price: number; amount: number; result: "won" | "lost" | "void" | null }
export interface WalletMonitor {
  wallet: string; short: string; tier: WalletFacts["tier"]; followed: boolean;
  /** All-time profit (the watchlist's), dollars; null when unknown. */
  pnl: number | null;
  record: WalletFacts["record"]; usualBet: number | null;
  /** Bets Insidir has from it in the last 24 hours, and their dollars. */
  today: { bets: number; dollars: number };
  bets: MonitorBet[];
}
export interface MarketPanel { money: MarketMoney; twin: MarketTwin | null; why: "watched" | "followed" | "most-bet" }
export interface Workspace { watched: WatchedView[]; told: ToldRow[]; monitor: WalletMonitor | null; market: MarketPanel | null; brief: Brief | null;
  /** The AI Bet Briefing for the Market panel's market (members: every line), logged to "What we told you". */
  briefing: GatedBriefing | null; fetchedAt: number }

/** The Bet Briefing for one market, within 6 seconds (the market page's budget), else null; logged once a day. */
export async function homeBriefing(db: Db, userId: string, marketId: string, now: number): Promise<GatedBriefing | null> {
  const b = await Promise.race([getBriefing(db, marketId, now).catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 6000))]);
  if (!b) return null;
  await logTold(db, userId, b, now).catch(() => undefined);
  return gateBriefing(b, true);
}

const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("workspace", e instanceof Error ? e.message : e); return d; });

export async function toldRows(db: Db, userId: string, limit = 12): Promise<ToldRow[]> {
  const r = await db.execute(sql`select id, kind, created_at, market_id, market_title, headline, body, result from terminal.told_log
    where user_id = ${userId} and kind in ('alert', 'brief') order by created_at desc limit ${limit}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    id: String(x.id), kind: x.kind as ToldRow["kind"], at: new Date(x.created_at as string).getTime(), marketId: (x.market_id as string | null) ?? null,
    title: (x.market_title as string | null) ?? null, headline: String(x.headline), body: (x.body as string | null) ?? null, result: (x.result as ToldRow["result"]) ?? null,
  }));
}

/** A wallet they follow (the first, by its latest bet), else the top wallet given (`fallback`), with its facts. */
export async function walletMonitor(db: Db, userId: string, fallback: string | null, now: number): Promise<WalletMonitor | null> {
  const followed = (await followList(db, userId)).filter(f => f.kind === "trader").map(f => f.target.toLowerCase());
  let wallet: string | null = null;
  if (followed.length) {
    const r = (await db.execute(sql`select wallet from terminal.millionaire_bets where wallet in (${sql.join(followed.map(w => sql`${w}`), sql`, `)})
      group by wallet order by max(at) desc limit 1`)).rows[0] as { wallet?: string } | undefined;
    wallet = r?.wallet ?? followed[0]!;
  }
  const isFollowed = Boolean(wallet);
  wallet ??= fallback?.toLowerCase() ?? null;
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) return null;
  const [facts, pnl, bets, today] = await Promise.all([
    walletFacts(db, [wallet], null),
    db.execute(sql`select pnl from terminal.watchlist where wallet = ${wallet}`).then(r => (r.rows[0] as { pnl?: number } | undefined)?.pnl ?? null),
    db.execute(sql`select id, at, market_title, market_id, outcome, price, amount, result from terminal.millionaire_bets where wallet = ${wallet} order by at desc limit 6`),
    db.execute(sql`select count(*)::int as n, coalesce(sum(amount), 0)::float as d from terminal.millionaire_bets where wallet = ${wallet} and at > ${new Date(now - DAY)}`),
  ]);
  const f = facts.get(wallet);
  const t = today.rows[0] as { n: number; d: number };
  return {
    wallet, short: f?.short ?? shortWallet(wallet), tier: f?.tier ?? null, followed: isFollowed, pnl: pnl === null ? null : Number(pnl),
    record: f?.record ?? null, usualBet: f?.usualBet ?? null, today: { bets: Number(t.n), dollars: Number(t.d) },
    bets: (bets.rows as Array<Record<string, unknown>>).map(b => ({ id: String(b.id), at: new Date(b.at as string).getTime(), title: String(b.market_title), marketId: String(b.market_id),
      outcome: String(b.outcome), price: Number(b.price), amount: Number(b.amount), result: (b.result as MonitorBet["result"]) ?? null })),
  };
}

/** Their market: the watched market with the most $1M+ money, else a followed market, else the most-bet market now. */
export async function marketPanel(db: Db, userId: string, watched: readonly WatchedView[], now: number): Promise<MarketPanel | null> {
  const total = (m: MarketMoney) => m.millionaire.yes.dollars + m.millionaire.no.dollars + m.pro.yes.dollars + m.pro.no.dollars;
  const pick = async (ids: string[], why: MarketPanel["why"]): Promise<MarketPanel | null> => {
    if (!ids.length) return null;
    const ms = (await marketMoney(db, { marketIds: ids, now })).sort((a, b) => total(b) - total(a));
    const m = ms[0];
    return m ? { money: m, twin: (await twinOf(db, [m.marketId]).catch(() => new Map<string, MarketTwin>())).get(m.marketId) ?? null, why } : null;
  };
  const open = [...new Set(watched.filter(w => !w.result).map(w => w.marketId))];
  const fromWatch = await pick(open, "watched");
  if (fromWatch) return fromWatch;
  const followed = (await followList(db, userId)).filter(f => f.kind === "market").map(f => f.target);
  const fromFollow = await pick(followed, "followed");
  if (fromFollow) return fromFollow;
  const top = (await marketMoney(db, { since: now - DAY, limit: 60, now })).sort((a, b) => total(b) - total(a))[0];
  return top ? { money: top, twin: (await twinOf(db, [top.marketId]).catch(() => new Map<string, MarketTwin>())).get(top.marketId) ?? null, why: "most-bet" } : null;
}

export async function workspace(db: Db, userId: string, topWallet: string | null, now: number): Promise<Workspace> {
  const watched = await safe(listWatched(db, userId), [] as WatchedView[]);
  const [told, monitor, market, brief] = await Promise.all([
    safe(toldRows(db, userId), [] as ToldRow[]),
    safe(walletMonitor(db, userId, topWallet, now), null),
    safe(marketPanel(db, userId, watched, now), null),
    safe(buildBrief(db, now, { member: true, userId }), null),
  ]);
  const briefing = market ? await safe(homeBriefing(db, userId, market.money.marketId, now), null) : null;
  return { watched, told, monitor, market, brief, briefing, fetchedAt: now };
}

/* What Insidir does, shown with its own real output on the landing (components/brand/landing/Landing.tsx Value):
 *   briefing   the Bet Briefing for the market with the most $1M+ money in the latest bets, as a visitor sees it (the
 *              first, side-neutral line of each section; lib/briefing/gate.ts)
 *   alert      the newest $1M+ bet, as the alert line a member holding the other side would read (no side)
 *   wallet     a $1M+ wallet's record: all-time profit and its last 10 settled markets, won and lost
 *   brief      the first two lines of today's 8 AM brief, as a visitor sees it (no sides)
 *   proof      the newest settled $1M+ bet with its Polygon transaction (settled, so its side is public)
 *   twins      how many markets are matched to Kalshi for the price beside Polymarket's
 * Cached 5 minutes for everyone; anything slow or missing is left out (the card then describes the feature only).
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { getBriefing } from "@/lib/briefing/store";
import { gateBriefing } from "@/lib/briefing/gate";
import { buildBrief } from "@/lib/brief/build";
import { walletSpotlight, type Spotlight } from "@/lib/brand/pulse";
import { shortWallet } from "@/lib/millionaires/watchlist";
import type { BoardBet } from "@/lib/millionaires/queries";

export interface Value {
  briefing: { title: string; href: string; lines: Array<{ k: string; t: string }> } | null;
  alert: { who: string; amount: number; usual: number | null; title: string } | null;
  wallet: Spotlight | null;
  brief: string[][];
  proof: { title: string; tx: string; result: string; amount: number } | null;
  twins: number;
}

const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>(res => setTimeout(() => res(fallback), ms))]);

const LABEL: Record<string, string> = { rules: "Wins if", cost: "Price and pays", who: "Big money", read: "The read" };

export function landingValue(db: Db, now: number, lead: readonly BoardBet[]): Promise<Value> {
  return memo("brand:value", 5 * 60_000, async () => {
    const top = [...lead].sort((a, b) => b.amount - a.amount)[0] ?? null;
    const [briefing, brief, wallet, proof, twins] = await Promise.all([
      top ? within(getBriefing(db, top.marketId, now).then(b => {
        if (!b) return null;
        const g = gateBriefing(b, false);
        const lines = g.sections.filter(s => LABEL[s.key] && s.lines[0]).map(s => ({ k: LABEL[s.key]!, t: s.lines[0]! }));
        return lines.length ? { title: b.title, href: `/briefing?m=${encodeURIComponent(b.marketId)}`, lines } : null;
      }), 4000, null) : Promise.resolve(null),
      within(buildBrief(db, now, { member: false, useModel: false }).then(b => b.items.slice(0, 2).map(i => [...i.lines])), 3000, [] as string[][]),
      within(walletSpotlight(db), 3000, null),
      within(db.execute(sql`select market_title, transaction_hash, result, amount from terminal.millionaire_bets
          where tier = 'millionaire' and result in ('won', 'lost') and transaction_hash is not null order by settled_at desc nulls last limit 1`)
        .then(r => { const x = r.rows[0] as { market_title: string; transaction_hash: string; result: string; amount: number } | undefined;
          return x ? { title: x.market_title, tx: x.transaction_hash, result: x.result, amount: Number(x.amount) } : null; }), 2000, null),
      within(db.execute(sql`select count(*)::int as n from terminal.market_twins where status = 'approved'`).then(r => Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0)), 2000, 0),
    ]);
    const a = lead.find(b => b.tier === "millionaire") ?? null;
    return {
      briefing, brief, wallet, proof, twins,
      alert: a ? { who: `${a.tier === "millionaire" ? "Millionaire" : "Pro"} ${a.short ?? shortWallet(a.wallet ?? "")}`, amount: a.amount, usual: a.usual ?? null, title: a.title } : null,
    };
  });
}

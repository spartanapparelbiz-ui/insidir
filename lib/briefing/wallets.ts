/* What Insidir knows about a watched wallet, for briefings, alerts and briefs: its tier and short address (never a
 * name, profile or picture), its settled record in a category (W–L and what $100 on each bet would have made, from
 * terminal.millionaire_bets, the same results data as the board's record), and its usual bet (median). Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { hundredOnEach, recordLine, type Settled } from "./math";

export interface WalletFacts {
  wallet: string; short: string; tier: "millionaire" | "pro" | null;
  /** Settled bets in the category (all time unless `since` was given): won, lost, $100 on each. */
  record: { n: number; won: number; lost: number; net: number; line: string } | null;
  /** The median of every bet Insidir has from it; null with fewer than 3. */
  usualBet: number | null;
}

/** Facts for these wallets in one category (lib/brand/categories.ts slug), optionally only bets since `since`. */
export async function walletFacts(db: Db, wallets: readonly string[], category: string | null, o: { since?: number } = {}): Promise<Map<string, WalletFacts>> {
  const ws = [...new Set(wallets.map(w => w.toLowerCase()))];
  const out = new Map<string, WalletFacts>();
  if (!ws.length) return out;
  const list = sql.join(ws.map(w => sql`${w}`), sql`, `);
  const tiers = (await db.execute(sql`select wallet, tier from terminal.watchlist where wallet in (${list})`)).rows as Array<{ wallet: string; tier: "millionaire" | "pro" }>;
  const usual = (await db.execute(sql`select wallet, count(*)::int as n, percentile_cont(0.5) within group (order by amount) as median
    from terminal.millionaire_bets where wallet in (${list}) group by wallet`)).rows as Array<{ wallet: string; n: number; median: number }>;
  const settled = (await db.execute(sql`select wallet, price, result from terminal.millionaire_bets
    where wallet in (${list}) and result in ('won', 'lost', 'void') ${category ? sql`and category = ${category}` : sql``}
    ${o.since ? sql`and at >= ${new Date(o.since)}` : sql``}`)).rows as Array<{ wallet: string; price: number; result: Settled["result"] }>;
  for (const w of ws) {
    const mine = settled.filter(s => s.wallet === w).map(s => ({ price: Number(s.price), result: s.result }));
    const h = hundredOnEach(mine);
    const u = usual.find(x => x.wallet === w);
    out.set(w, {
      wallet: w, short: shortWallet(w), tier: tiers.find(t => t.wallet === w)?.tier ?? null,
      record: h.won + h.lost > 0 ? { ...h, line: recordLine(h) } : null,
      usualBet: u && Number(u.n) >= 3 ? Number(u.median) : null,
    });
  }
  return out;
}

/** "Millionaire 0x7c3d…5c6b" / "Pro 0xab12…9f00": a wallet is only ever its tier and short address. */
export const walletName = (f: Pick<WalletFacts, "tier" | "short">): string => `${f.tier === "millionaire" ? "Millionaire" : f.tier === "pro" ? "Pro" : "Wallet"} ${f.short}`;

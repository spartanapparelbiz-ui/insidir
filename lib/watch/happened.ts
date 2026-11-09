/* "What happened": once a watched market settles, the result; who was right (where the $1M+ money was, and how much);
 * what $100 following each of the biggest wallets at its own price would have paid; the member's own bet; and their
 * record by category from every watched bet that settled. Facts in code; whatHappened is pure, happenedFor reads. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { cents, signed } from "@/lib/briefing/math";
import { walletName } from "@/lib/briefing/wallets";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";

export interface TopWallet { wallet: string; tier: "millionaire" | "pro"; side: "yes" | "no"; price: number; amount: number }
export interface MyBet { side: "yes" | "no"; price: number; amount: number; shares: number }
export interface CategoryRecord { category: string; won: number; lost: number; net: number }
export interface HappenedInput {
  title: string; result: "yes" | "no" | "void"; yesLabel: string; noLabel: string;
  money: Record<"yes" | "no", { dollars: number; wallets: number }>;
  top: TopWallet[]; mine: MyBet | null; record: CategoryRecord[];
}
export interface Happened { result: string; right: string | null; following: string[]; mine: string | null; record: string[] }

/** What $100 at a price pays when the side wins, loses or the market is voided. */
export const hundredPays = (price: number, outcome: "won" | "lost" | "void"): number => (outcome === "void" ? 100 : outcome === "won" && price > 0 ? 100 / price : 0);
const outcomeOf = (side: "yes" | "no", result: "yes" | "no" | "void"): "won" | "lost" | "void" => (result === "void" ? "void" : side === result ? "won" : "lost");

export function whatHappened(x: HappenedInput): Happened {
  const label = (s: "yes" | "no") => (s === "yes" ? x.yesLabel : x.noLabel);
  const result = x.result === "void" ? `"${x.title}" was voided: every bet got its money back.` : `"${x.title}" settled ${label(x.result)}.`;
  let right: string | null = null;
  const total = x.money.yes.dollars + x.money.no.dollars;
  if (total > 0 && x.result !== "void") {
    const w = x.money[x.result], l = x.money[x.result === "yes" ? "no" : "yes"];
    const parts = [`${dollars(w.dollars)} of the $1M+ money (${w.wallets} ${w.wallets === 1 ? "wallet" : "wallets"}) was on ${label(x.result)}, and right`];
    if (l.dollars > 0) parts.push(`${dollars(l.dollars)} (${l.wallets} ${l.wallets === 1 ? "wallet" : "wallets"}) was on ${label(x.result === "yes" ? "no" : "yes")}, and wrong`);
    right = parts.join("; ") + ".";
  }
  const following = [...x.top].sort((a, b) => b.amount - a.amount).slice(0, 5).map(t => {
    const o = outcomeOf(t.side, x.result), pays = hundredPays(t.price, o);
    return `$100 following ${walletName({ tier: t.tier, short: shortWallet(t.wallet) })} on ${label(t.side)} at ${cents(t.price)} paid ${dollars(pays)} (${signed(pays - 100)}).`;
  });
  let mine: string | null = null;
  if (x.mine) {
    const o = outcomeOf(x.mine.side, x.result);
    const back = o === "void" ? x.mine.amount : o === "won" ? x.mine.shares : 0;
    mine = `Your ${dollars(x.mine.amount)} on ${label(x.mine.side)} at ${cents(x.mine.price)} ${o === "void" ? "came back" : o === "won" ? "won" : "lost"}: ${dollars(back)} back (${signed(back - x.mine.amount)}).`;
  }
  const record = x.record.filter(r => r.won + r.lost > 0).map(r => {
    const name = isCategory(r.category) ? categoryInfo(r.category).name : r.category;
    return `${name}: ${r.won}–${r.lost}, ${signed(r.net)}.`;
  });
  return { result, right, following, mine, record };
}

/** The member's record by category from their settled watched bets (won, lost, net dollars). */
export async function myRecord(db: Db, userId: string): Promise<CategoryRecord[]> {
  const r = await db.execute(sql`select coalesce(category, 'world') as category,
      count(*) filter (where result = 'won')::int as won, count(*) filter (where result = 'lost')::int as lost,
      coalesce(sum(case when result = 'won' then shares - amount when result = 'lost' then -amount else 0 end), 0)::float as net
    from terminal.watched_bets where user_id = ${userId} and removed_at is null and result in ('won', 'lost', 'void') group by 1 order by count(*) desc`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({ category: String(x.category), won: Number(x.won), lost: Number(x.lost), net: Number(x.net) }));
}

/** "What happened" for one of the member's settled watched bets. */
export async function happenedFor(db: Db, userId: string, watchId: string, record?: CategoryRecord[]): Promise<Happened | null> {
  const w = (await db.execute(sql`select * from terminal.watched_bets where id = ${watchId} and user_id = ${userId} and result in ('won', 'lost', 'void')`)).rows[0] as Record<string, unknown> | undefined;
  if (!w) return null;
  const marketId = String(w.market_id), side = w.side as "yes" | "no";
  const marketResult: "yes" | "no" | "void" = w.result === "void" ? "void" : w.result === "won" ? side : side === "yes" ? "no" : "yes";
  const bets = (await db.execute(sql`select wallet, tier, outcome_side, sum(amount)::float as amount, (sum(price * amount) / nullif(sum(amount), 0))::float as price,
      max(yes_label) as yes_label, max(no_label) as no_label, max(outcome) as outcome
    from terminal.millionaire_bets where market_id = ${marketId} group by wallet, tier, outcome_side`)).rows as Array<Record<string, unknown>>;
  const money = { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } };
  for (const b of bets.filter(b => b.tier === "millionaire")) { const s = b.outcome_side as "yes" | "no"; money[s].dollars += Number(b.amount); money[s].wallets++; }
  const other = bets.find(b => b.outcome_side !== side);
  const yesLabel = side === "yes" ? String(w.outcome) : String(bets.find(b => b.yes_label)?.yes_label ?? other?.outcome ?? "Yes");
  const noLabel = side === "no" ? String(w.outcome) : String(bets.find(b => b.no_label)?.no_label ?? other?.outcome ?? "No");
  return whatHappened({
    title: String(w.market_title), result: marketResult, yesLabel, noLabel, money,
    top: bets.filter(b => Number(b.price) > 0).map(b => ({ wallet: String(b.wallet), tier: b.tier === "millionaire" ? "millionaire" : "pro", side: b.outcome_side as "yes" | "no", price: Number(b.price), amount: Number(b.amount) })),
    mine: { side, price: Number(w.price), amount: Number(w.amount), shares: Number(w.shares) },
    record: record ?? await myRecord(db, userId),
  });
}

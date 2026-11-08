/* "Explain this market" (members, on a market's page): a few plain sentences on what Insidir's data shows about one
 * market, written by the analyst layer (lib/analyst: the model sees only these facts, and lib/analyst/validate.ts holds
 * every note to them: no number or name that isn't in a fact, no advice, prediction or certainty, no "should"). A note
 * that fails twice, or no model, or the spend cap, gives the template built from the same facts.
 *
 * It explains; it never recommends. Switch it off with AI_EXPLAIN=off. Notes are kept 15 minutes per market. Spend
 * counts toward the analyst's monthly cap (ANALYST_MONTHLY_USD) under its own key. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { category as categoryInfo } from "@/lib/brand/categories";
import { memo } from "@/lib/memo";
import { marketMoney, positions } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { dbUsageStore } from "@/lib/worker/store";
import { notesCapUsd } from "./store";
import { writeNote } from "./note";
import type { Fact, Facts } from "./types";

export const explainOn = (env: Record<string, string | undefined> = process.env): boolean => (env.AI_EXPLAIN ?? "on").toLowerCase() !== "off";

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const wallets = (n: number) => `${n} ${n === 1 ? "wallet" : "wallets"}`;

/** Everything an explanation may say about one market, from Insidir's data only. Pure apart from the reads. */
export async function marketFacts(db: Db, marketId: string, now: number): Promise<Facts | null> {
  const [m] = await marketMoney(db, { marketIds: [marketId], now });
  if (!m) return null;
  const pos = await positions(db, marketId);
  const label = (side: "yes" | "no") => (side === "yes" ? m.yesLabel : m.noLabel);
  const facts: Fact[] = [{ key: "market", label: "Market", text: m.title }];
  for (const side of ["yes", "no"] as const) {
    const mil = m.millionaire[side], pro = m.pro[side];
    if (mil.dollars) facts.push({ key: `mil_${side}`, label: `Millionaire money on ${label(side)}`, text: `${dollars(mil.dollars)} from ${wallets(mil.wallets)} up $1M+ on ${label(side)}` });
    if (pro.dollars) facts.push({ key: `pro_${side}`, label: `Pro money on ${label(side)}`, text: `${dollars(pro.dollars)} from ${wallets(pro.wallets)} up $100K+ on ${label(side)}` });
    const own = pos.filter(p => p.side === side && p.dollars > 0);
    if (own.length) {
      const money = own.reduce((s, p) => s + p.dollars, 0), avg = own.reduce((s, p) => s + p.dollars * p.price, 0) / money;
      facts.push({ key: `avg_${side}`, label: `Average price paid on ${label(side)}`, text: `an average of ${cents(avg)} paid on ${label(side)}` });
    }
  }
  if (m.priceNow !== null) facts.push({ key: "price_now", label: "Price now", text: `${m.yesLabel} at ${cents(m.priceNow)} and ${m.noLabel} at ${cents(1 - m.priceNow)} on Polymarket now` });
  const top = pos[0];
  if (top) {
    facts.push({ key: "biggest", label: "Biggest position", text: `the biggest position is ${dollars(top.dollars)} on ${top.outcome} at ${cents(top.price)}${top.pnl !== null ? `, from a wallet up ${dollars(top.pnl)} all-time` : ""}` });
    const rec = (await db.execute(sql`select won, lost from terminal.trader_records where wallet = ${top.wallet}`)).rows[0] as { won: number; lost: number } | undefined;
    if (rec && rec.won + rec.lost >= 10) facts.push({ key: "biggest_record", label: "That wallet's record", text: `that wallet won ${rec.won} of its ${rec.won + rec.lost} settled markets` });
  }
  const both = m.millionaire.yes.dollars > 0 && m.millionaire.no.dollars > 0;
  facts.push({ key: "split", label: "Agreement", text: both ? "wallets up $1M+ are on both sides" : "wallets up $1M+ are all on one side" });
  return { moveId: `market:${marketId}`, kind: "bet", names: [m.yesLabel, m.noLabel, m.title, m.event, categoryInfo(m.category).name, "Polymarket", "Pro"], facts, at: now };
}

export interface Explanation { text: string; origin: "model" | "template" }

const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** The fallback: the same facts in fixed sentences (no model, a failed note, or the spend cap). */
export function marketTemplate(f: Facts): string {
  const get = (k: string) => f.facts.find(x => x.key === k)?.text ?? null;
  const money = ["mil_yes", "mil_no"].map(get).filter(Boolean) as string[];
  const out: string[] = [];
  if (money.length) out.push(`${cap1(money.join(", and "))}.`);
  const big = get("biggest"), rec = get("biggest_record");
  if (big) out.push(`${cap1(big)}${rec ? `; ${rec}` : ""}.`);
  const now = get("price_now");
  if (now) out.push(`${cap1(now)}.`);
  return out.slice(0, 3).join(" ");
}

const monthKey = (now: number) => `${new Date(now).toISOString().slice(0, 7)}:explain`;

/** The explanation for one market, kept 15 minutes. Null when the market has no millionaire or Pro money to explain. */
export function explainMarket(db: Db, marketId: string, now: number): Promise<Explanation | null> {
  return memo(`explain:${marketId}`, 15 * 60_000, async () => {
    const facts = await marketFacts(db, marketId, now);
    if (!facts || facts.facts.length < 3) return null;
    const usage = dbUsageStore(db);
    const over = (await usage.getMonthSpendUsd(monthKey(now)).catch(() => 0)) >= notesCapUsd() / 3;
    const note = await writeNote(facts, over ? { f: (async () => { throw new Error("budget"); }) as unknown as typeof fetch } : {});
    if (note.costUsd) await usage.addSpendUsd(monthKey(now), note.costUsd).catch(() => undefined);
    return note.origin === "model" && note.text ? { text: note.text, origin: "model" } : { text: marketTemplate(facts), origin: "template" };
  });
}

/* The rules report (/results, qa/rules/backtest.md): the starter rules and the variants that decide what Insidir leads
 * with, each backtested the same way (lib/autopilot/backtest.ts): the last 180 days, no lookahead, at Kalshi's ask then
 * + 1¢, $25 a bet, held to settlement, losses included. A rule leads only if it is positive over MIN_SETTLED+ settled
 * bets. Pure. */
import { CATEGORY_SLUGS } from "@/lib/brand/categories";
import { backtest, BACKTEST_DAYS, type Backtest, type BtRow } from "./backtest";
import { DEFAULT_SPEC, type RuleSpec } from "./rules";
import { STARTERS } from "./starters";

export const LEAD_MIN_SETTLED = 100;
export const REPORT_KEY = "report:rules:v1";

export interface ReportRow { key: string; group: string; name: string; result: Backtest; settled: number; leads: boolean }
export interface RulesReport { at: number; days: number; rows: ReportRow[]; bets: number; onKalshi: number; note: string }

const spec = (o: { triggers?: Partial<RuleSpec["triggers"]>; price?: Partial<RuleSpec["price"]>; markets?: Partial<RuleSpec["markets"]> } = {}): RuleSpec => ({
  ...DEFAULT_SPEC, markets: { ...DEFAULT_SPEC.markets, ...o.markets },
  triggers: { ...DEFAULT_SPEC.triggers, minBet: 5_000, ...o.triggers },
  price: { max: 0.99, maxMoveCents: 50, ...o.price },
  // No caps in the comparisons: each bet counts, so variants compare like for like.
  stake: { perBet: 25, daily: 1e9, weekly: 1e9 },
});

const BANDS: Array<[string, number, number]> = [["Under 30¢", 0, 0.3], ["30–50¢", 0.3, 0.5], ["50–70¢", 0.5, 0.7], ["70–85¢", 0.7, 0.85], ["85¢ and up", 0.85, 1.01]];

export function rulesReport(rows: readonly BtRow[], now: number): RulesReport {
  const out: ReportRow[] = [];
  const add = (key: string, group: string, name: string, s: RuleSpec, where?: (r: BtRow, entry: number) => boolean) => {
    const result = backtest(s, rows, now, BACKTEST_DAYS, { where });
    const settled = result.won + result.lost;
    out.push({ key, group, name, result, settled, leads: settled >= LEAD_MIN_SETTLED && result.net > 0 });
  };
  add("all", "Baseline", "Every proven-wallet bet of $1K+", spec());
  for (const s of STARTERS) add(`starter:${s.key}`, "Starter rules", s.name, { ...s.spec, stake: { perBet: 25, daily: 1e9, weekly: 1e9 } });
  add("consensus", "Variants", "2+ proven wallets, same side, within 1h", spec({ triggers: { consensus: true } }));
  add("first", "Variants", "First entry only", spec({ triggers: { firstEntry: true } }));
  add("big", "Variants", "Bets of $50K+", spec({ triggers: { minBet: 50_000 } }));
  add("consensus-first", "Variants", "First entry, 2+ wallets agree", spec({ triggers: { consensus: true, firstEntry: true } }));
  for (const g of [3, 5, 8]) add(`guard:${g}`, "Too-late guard", `Skip if Kalshi is ${g}¢+ above their price`, spec({ price: { maxMoveCents: g } }));
  for (const [name, lo, hi] of BANDS) add(`band:${lo}`, "Entry price on Kalshi", name, spec(), (_r, e) => e >= lo && e < hi);
  for (const c of CATEGORY_SLUGS) {
    if (!rows.some(r => r.category === c)) continue;
    add(`cat:${c}`, "Category", c, spec({ markets: { categories: [c] } }));
  }
  const recent = rows.filter(r => r.at > now - BACKTEST_DAYS * 86_400_000);
  return { at: now, days: BACKTEST_DAYS, rows: out, bets: recent.length, onKalshi: recent.filter(r => r.kalshiAsk !== null).length,
    note: "Sell-when-they-exit isn't in the table: Insidir records exits only since Nov 2, too few to compare. Every row holds to settlement." };
}

/** The rules that may lead (positive over LEAD_MIN_SETTLED+ settled), best net first. Pure. */
export const leaders = (r: RulesReport | null): ReportRow[] => (r ? r.rows.filter(x => x.leads && x.group !== "Category" && x.group !== "Entry price on Kalshi").sort((a, b) => b.result.net - a.result.net) : []);

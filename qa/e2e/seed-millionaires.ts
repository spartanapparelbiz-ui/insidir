/* The e2e database's millionaire fixtures (qa/e2e/seed.ts calls it): a watchlist of four Millionaire and two Pro
 * wallets, open bets in four categories (one on the seeded Tennis match 100, so a check of it has millionaire money),
 * market prices, 30 settled Millionaire bets (20 won, 10 lost at 45¢), and a rules report with one leading rule. Test
 * data. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

const MIN = 60_000, DAY = 86_400_000;
export const MW = (n: number) => `0xe2e0000000000000000000000000000000000${String(n).padStart(3, "0")}`;
export const MIL_MARKETS = { tennis: "0xe2etennis100", nfl: "0xe2emilnfl", pol: "0xe2emilpol", soc: "0xe2emilsoc" } as const;

/** The games' Polymarket event URLs (lib/teams reads the league and both teams from them: their logos). */
const GAME_URL: Record<string, string> = {
  [MIL_MARKETS.nfl]: "https://polymarket.com/event/nfl-kc-buf-2026-11-08/nfl-kc-buf-2026-11-08",
  [MIL_MARKETS.soc]: "https://polymarket.com/event/epl-ars-che-2026-11-08/epl-ars-che-2026-11-08-ars",
};

export async function seedMillionaires(db: Db, now: number): Promise<void> {
  await db.execute(sql`truncate terminal.watchlist, terminal.millionaire_bets`);
  const wallets: Array<[number, "millionaire" | "pro", number]> = [[1, "millionaire", 3_100_000], [2, "millionaire", 2_400_000], [3, "millionaire", 1_500_000], [4, "millionaire", 1_200_000], [5, "pro", 450_000], [6, "pro", 210_000]];
  for (const [n, tier, pnl] of wallets) await db.execute(sql`insert into terminal.watchlist (wallet, tier, pnl, refreshed_at) values (${MW(n)}, ${tier}, ${pnl}, ${new Date(now)})`);
  const bet = (id: string, n: number, tier: string, market: string, title: string, outcome: string, side: "yes" | "no", amount: number, price: number, category: string, mins: number, yes: string, no: string, result: string | null = null) =>
    db.execute(sql`insert into terminal.millionaire_bets (id, wallet, tier, source, market_id, event_title, market_title, outcome, outcome_side, amount, price, category, url, yes_label, no_label, at, last_at, result, settled_at)
      values (${id}, ${MW(n)}, ${tier}, 'polymarket', ${market}, ${title}, ${title}, ${outcome}, ${side}, ${amount}, ${price}, ${category}, ${GAME_URL[market] ?? null}, ${yes}, ${no},
        ${new Date(now - mins * MIN)}, ${new Date(now - mins * MIN)}, ${result}, ${result ? new Date(now - mins * MIN + DAY) : null})`);
  const T = "E2E fixture: Tennis match 100", N = "E2E fixture: Chiefs vs. Bills", P = "E2E fixture: Will the funding bill pass?", S = "E2E fixture: Arsenal FC vs. Chelsea FC";
  await bet("e2e:mb1", 1, "millionaire", MIL_MARKETS.tennis, T, "Player A", "yes", 74_000, 0.52, "tennis", 25, "Player A", "Player B");
  await bet("e2e:mb2", 2, "millionaire", MIL_MARKETS.tennis, T, "Player A", "yes", 40_000, 0.55, "tennis", 50, "Player A", "Player B");
  await bet("e2e:mb3", 5, "pro", MIL_MARKETS.tennis, T, "Player B", "no", 12_000, 0.46, "tennis", 70, "Player A", "Player B");
  await bet("e2e:mb4", 1, "millionaire", MIL_MARKETS.nfl, N, "Chiefs", "yes", 85_000, 0.47, "football", 8, "Chiefs", "Bills");
  await bet("e2e:mb5", 3, "millionaire", MIL_MARKETS.nfl, N, "Bills", "no", 30_000, 0.53, "football", 35, "Chiefs", "Bills");
  await bet("e2e:mb6", 4, "millionaire", MIL_MARKETS.nfl, N, "Chiefs", "yes", 20_000, 0.48, "football", 90, "Chiefs", "Bills");
  await bet("e2e:mb7", 2, "millionaire", MIL_MARKETS.pol, P, "Yes", "yes", 50_000, 0.62, "politics", 15, "Yes", "No");
  await bet("e2e:mb8", 6, "pro", MIL_MARKETS.soc, S, "Arsenal FC", "yes", 9_000, 0.41, "soccer", 40, "Arsenal FC", "Chelsea FC");
  for (let i = 0; i < 30; i++) await bet(`e2e:ms${i}`, 1 + (i % 4), "millionaire", `0xe2emilsettled${i}`, `E2E fixture: settled market ${i}`, "Yes", "yes", 10_000, 0.45, "football", (10 + i) * 24 * 60, "Yes", "No", i < 20 ? "won" : "lost");
  // The markets themselves, as the sweep stores them (so a check of one resolves).
  for (const [id, title, yes, no, p] of [[MIL_MARKETS.nfl, N, "Chiefs", "Bills", 0.51], [MIL_MARKETS.pol, P, "Yes", "No", 0.66], [MIL_MARKETS.soc, S, "Arsenal FC", "Chelsea FC", 0.44]] as const) {
    const data = { venue: "polymarket", id, title, eventTitle: title, yesLabel: yes, noLabel: no, url: `https://polymarket.com/event/${id.slice(2)}`, yesPrice: p, volume24h: 50_000, active: true, result: null, closeTime: now + 7 * DAY, category: "sports" };
    await db.execute(sql`insert into terminal.markets (venue, id, data) values ('polymarket', ${id}, ${JSON.stringify(data)}::jsonb) on conflict (venue, id) do update set data = excluded.data`);
  }
  for (const [id, p] of [[MIL_MARKETS.nfl, 0.51], [MIL_MARKETS.pol, 0.66], [MIL_MARKETS.soc, 0.44]] as const) {
    await db.execute(sql`insert into terminal.market_info (source, market_id, yes_price, closed, updated_at) values ('polymarket', ${id}, ${p}, false, ${new Date(now)}) on conflict do nothing`);
  }
  // The rules report (lib/autopilot/report.ts): following every bet loses; one rule is positive over 100+ settled and
  // leads /go, the paywall and the landing; one is positive under 100 settled and may not.
  const res = (won: number, lost: number, net: number) => ({ days: 180, from: now - 180 * DAY, to: now, bets: won + lost, won, lost, void: 0, open: 0, staked: (won + lost) * 25, net,
    roi: net / ((won + lost) * 25), winRate: won / (won + lost), tooLate: 0, capped: 0, maxDrawdown: 0, offKalshi: 0 });
  const report = { at: now, days: 180, bets: 400, onKalshi: 380, note: "", rows: [
    { key: "all", group: "Baseline", name: "Every proven-wallet bet of $5K+", result: res(133, 144, -907), settled: 277, leads: false },
    { key: "consensus", group: "Variants", name: "2+ proven wallets, same side, within 1h", result: res(40, 20, 300), settled: 60, leads: false },
    { key: "big", group: "Variants", name: "Bets of $50K+", result: res(64, 54, 412), settled: 118, leads: true },
  ] };
  await db.execute(sql`insert into terminal.autopilot_backtests (key, result, computed_at) values ('report:rules:v1', ${JSON.stringify(report)}::jsonb, ${new Date(now)})
    on conflict (key) do update set result = excluded.result, computed_at = excluded.computed_at`);
}

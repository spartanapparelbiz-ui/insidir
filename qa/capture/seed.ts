/* Seeds the CAPTURE database (refuses unless DATABASE_URL names an "e2e" database) with production-shaped data for
 * the landing and dashboard captures: real market names, the big bets and tracker records as they stood on Nov 2,
 * 2026, and a member called Jordan. Runs after the e2e seed (qa/e2e/serve.ts), whose users it keeps and whose
 * "E2E fixture" markets it removes. Wallets are made-up addresses; nobody is named.
 * Run: DATABASE_URL=…/terminal_capture_e2e npx tsx qa/capture/seed.ts */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { marketInfo, moves } from "@/lib/db/schema";
import { watchlistOnce } from "@/lib/millionaire/watchlist";
import { syncMillionaireBets } from "@/lib/millionaire/bets";
import { TRACKER_RULES_V } from "@/lib/trackers";

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const url = process.env.DATABASE_URL ?? "";
if (!/e2e/.test(url)) throw new Error("Refusing: DATABASE_URL must name an e2e database.");

type Src = "polymarket" | "kalshi";
interface Mkt { source: Src; id: string; event: string; title: string; yes: string; no: string; yesPrice: number; volume: number; tab: "sports" | "markets"; league: string | null; category: string; endInDays: number }

const M = {
  senate: { source: "polymarket", id: "0x5e7a7e2026c0ntr01", event: "Which party will control the Senate after the 2026 midterms?", title: "Which party will control the Senate after the 2026 midterms?", yes: "Democrats", no: "Republicans", yesPrice: 0.715, volume: 4_812_000, tab: "markets", league: null, category: "politics", endInDays: 62 },
  house: { source: "polymarket", id: "0x40u5e2026c0ntr01", event: "Which party will control the House after the 2026 midterms?", title: "Which party will control the House after the 2026 midterms?", yes: "Democrats", no: "Republicans", yesPrice: 0.945, volume: 3_276_000, tab: "markets", league: null, category: "politics", endInDays: 62 },
  michigan: { source: "kalshi", id: "SENATEMI-26-D", event: "Michigan Senate race 2026", title: "Michigan Senate race 2026", yes: "Democrats", no: "Republicans", yesPrice: 0.755, volume: 912_000, tab: "markets", league: null, category: "politics", endInDays: 30 },
  texas: { source: "kalshi", id: "SENATETX-26-R", event: "Texas Senate race 2026", title: "Texas Senate race 2026", yes: "Republicans", no: "Democrats", yesPrice: 0.305, volume: 1_204_000, tab: "markets", league: null, category: "politics", endInDays: 30 },
  iowa: { source: "polymarket", id: "0x10wa5enate2026r", event: "Iowa Senate race 2026", title: "Will Republicans win the Iowa Senate race?", yes: "Yes", no: "No", yesPrice: 0.61, volume: 388_000, tab: "markets", league: null, category: "politics", endInDays: 30 },
  kcden: { source: "polymarket", id: "0xnf1kcden1109ml", event: "Chiefs vs. Broncos", title: "Chiefs vs. Broncos", yes: "Chiefs", no: "Broncos", yesPrice: 0.505, volume: 2_140_000, tab: "sports", league: "NFL", category: "sports", endInDays: 7 },
  kcdenSpread: { source: "polymarket", id: "0xnf1kcden1109sp", event: "Chiefs vs. Broncos", title: "Spread: Chiefs (-1.5)", yes: "Chiefs -1.5", no: "Broncos +1.5", yesPrice: 0.47, volume: 640_000, tab: "sports", league: "NFL", category: "sports", endInDays: 7 },
  lacla: { source: "polymarket", id: "0xnf1lacla1102ml", event: "Chargers vs. Rams", title: "Chargers vs. Rams", yes: "Chargers", no: "Rams", yesPrice: 0.255, volume: 2_870_000, tab: "sports", league: "NFL", category: "sports", endInDays: 1 },
  laclaTotal: { source: "polymarket", id: "0xnf1lacla1102ou", event: "Chargers vs. Rams", title: "Chargers vs. Rams: O/U 44.5", yes: "Over 44.5", no: "Under 44.5", yesPrice: 0.545, volume: 410_000, tab: "sports", league: "NFL", category: "sports", endInDays: 1 },
  boorl: { source: "kalshi", id: "KXNBAGAME-26NOV02BOSORL", event: "Celtics vs. Magic", title: "Celtics vs. Magic", yes: "Celtics", no: "Magic", yesPrice: 0.715, volume: 760_000, tab: "sports", league: "NBA", category: "sports", endInDays: 1 },
  tencin: { source: "polymarket", id: "0xnf1tencin1102ml", event: "Titans vs. Bengals", title: "Titans vs. Bengals", yes: "Titans", no: "Bengals", yesPrice: 0.635, volume: 1_090_000, tab: "sports", league: "NFL", category: "sports", endInDays: 1 },
} satisfies Record<string, Mkt>;

/** A made-up wallet address from a number (never a real person's). */
const wallet = (n: number) => "0x" + (BigInt(n) * 0x9e3779b97f4a7c15n).toString(16).padStart(40, "7").slice(-40);

async function main() {
  const db = getDb(), now = Date.now();
  // Out with the e2e fixtures' markets and positions (users, sessions and the rest stay).
  for (const t of ["terminal.millionaire_pings", "terminal.millionaire_bets", "terminal.millionaire_wallets", "terminal.move_tags", "terminal.moves", "terminal.market_info", "terminal.markets", "terminal.pairs", "terminal.read_seen", "terminal.reads", "terminal.whale_trades", "terminal.near_misses"]) {
    await db.execute(sql.raw(`delete from ${t}`)).catch(() => undefined);
  }
  const all = Object.values(M) as Mkt[];
  for (const m of all) {
    await db.execute(sql`insert into terminal.markets (venue, id, data) values (${m.source}, ${m.id}, ${JSON.stringify({ venue: m.source, id: m.id, title: m.title, eventTitle: m.event, yesLabel: m.yes, noLabel: m.no, yesPrice: m.yesPrice, volume24h: m.volume, category: m.category, closeTime: now + m.endInDays * DAY })}::jsonb)`);
  }
  await db.insert(marketInfo).values(all.map(m => ({ source: m.source, marketId: m.id, yesPrice: m.yesPrice, closed: false, historyKey: null, endAt: new Date(now + m.endInDays * DAY),
    startAt: m.tab === "sports" ? new Date(now + (m.endInDays - 1) * DAY + 5 * HOUR) : null, updatedAt: new Date(now) })));

  let w = 1;
  const mv = (id: string, m: Mkt, o: { side: "yes" | "no"; amount: number; price: number; ago: number; trackers?: string[] }) => ({
    id, source: m.source, marketId: m.id, eventTitle: m.event, marketTitle: m.title, outcome: o.side === "yes" ? m.yes : m.no, outcomeSide: o.side,
    amount: o.amount, avgPrice: o.price, wallet: m.source === "polymarket" ? wallet(w++) : null, walletName: null, fills: 2, tab: m.tab, league: m.league, category: m.category,
    url: m.source === "kalshi" ? `https://kalshi.com/markets/${m.id.toLowerCase()}` : `https://polymarket.com/event/${m.id}`,
    at: new Date(now - o.ago), lastAt: new Date(now - o.ago + 2 * MIN), seenAt: new Date(now - o.ago), seenPrice: Math.min(0.98, o.price + 0.01), seenSrc: "history",
    trackers: o.trackers ?? [m.league === "NFL" ? "nfl-big-money" : m.league === "NBA" ? "nba-big-money" : "elections-2026"], trackersV: TRACKER_RULES_V,
  });
  // The last 24 hours' big bets.
  const live = [
    mv("cap:b1", M.lacla, { side: "no", amount: 139_771, price: 0.69, ago: 4 * MIN }),
    mv("cap:b2", M.kcdenSpread, { side: "yes", amount: 96_359, price: 0.47, ago: 38 * MIN }),
    mv("cap:b3", M.tencin, { side: "yes", amount: 65_000, price: 0.65, ago: 71 * MIN }),
    mv("cap:b4", M.kcdenSpread, { side: "no", amount: 53_000, price: 0.53, ago: 2 * HOUR }),
    mv("cap:b5", M.kcden, { side: "no", amount: 47_000, price: 0.50, ago: 3 * HOUR }),
    mv("cap:b6", M.lacla, { side: "no", amount: 34_004, price: 0.75, ago: 5 * HOUR }),
    mv("cap:b7", M.iowa, { side: "yes", amount: 29_410, price: 0.60, ago: 7 * HOUR }),
    mv("cap:b8", M.laclaTotal, { side: "no", amount: 26_832, price: 0.45, ago: 9 * HOUR }),
  ];
  // Earlier money on the markets that had none today (2 to 9 days back).
  const earlier = [
    mv("cap:e1", M.senate, { side: "yes", amount: 212_000, price: 0.69, ago: 2 * DAY }),
    // Entered under 40%: a Long Shots position (lib/trackers.ts underdog-hunters), so proven money holds it.
    mv("cap:e2", M.senate, { side: "no", amount: 88_500, price: 0.31, ago: 4 * DAY, trackers: ["elections-2026", "underdog-hunters"] }),
    mv("cap:e3", M.house, { side: "yes", amount: 154_000, price: 0.93, ago: 3 * DAY }),
    mv("cap:e4", M.michigan, { side: "yes", amount: 41_200, price: 0.74, ago: 2 * DAY + 5 * HOUR }),
    mv("cap:e5", M.texas, { side: "no", amount: 57_800, price: 0.68, ago: 5 * DAY }),
    mv("cap:e6", M.boorl, { side: "yes", amount: 38_000, price: 0.70, ago: 30 * HOUR }),
    mv("cap:e7", M.kcden, { side: "yes", amount: 61_500, price: 0.51, ago: 2 * DAY }),
    mv("cap:e8", M.tencin, { side: "no", amount: 22_000, price: 0.37, ago: 3 * DAY }),
  ];
  await db.insert(moves).values([...live, ...earlier]);

  // Profit tiers (terminal.wallet_pnl, as the proven-wallet backfill stores Polymarket's leaderboard pnl): a few of
  // these wallets have made $1M+ all-time, some $100K+, the rest less or no row at all.
  const pnl: Array<[string, number]> = [["cap:b1", 2_410_000], ["cap:b2", 1_120_000], ["cap:b3", 380_000], ["cap:b4", 1_640_000], ["cap:b6", 3_180_000],
    ["cap:b7", 1_310_000], ["cap:b8", 152_000], ["cap:e1", 5_060_000], ["cap:e2", 640_000], ["cap:e3", 1_820_000], ["cap:e7", 2_030_000], ["cap:e8", 41_000]];
  const byId = new Map([...live, ...earlier].map(m => [m.id, m.wallet]));
  await db.execute(sql`delete from terminal.wallet_pnl`);
  for (const [id, v] of pnl) {
    const w = byId.get(id);
    if (w) await db.execute(sql`insert into terminal.wallet_pnl (wallet, closed, closed_at_least, pnl, read_at) values (${w}, ${400 + Math.round(v / 10_000)}, false, ${v}, ${new Date(now)}) on conflict (wallet) do update set pnl = excluded.pnl`);
  }
  // The watchlist and its bets, as the worker builds them: the leaderboard pass (none here) plus every wallet_pnl
  // wallet, then the watchlist wallets' $5K+ tracked moves copied in as millionaire bets.
  await watchlistOnce(db, { getLeaderboardPage: async () => [] }, now);
  await syncMillionaireBets(db);

  // Tracker records: settled positions, $100 followed at the shown price plus one cent, spread over 120 days, wins
  // interleaved so every window carries the same rate. One price per tracker makes "All" come out at the stated
  // return: return = won / (n × (price + 0.01)) − 1.
  const records: Array<{ slug: string; league: string | null; tab: "sports" | "markets"; category: string; label: string; n: number; ret: number; winShare: number }> = [
    { slug: "underdog-hunters", league: "MLB", tab: "sports", category: "sports", label: "MLB game", n: 493, ret: 0.189, winShare: 0.3 },
    { slug: "la-liga", league: "La Liga", tab: "sports", category: "sports", label: "La Liga match", n: 253, ret: 0.131, winShare: 0.55 },
    { slug: "nhl-big-money", league: "NHL", tab: "sports", category: "sports", label: "NHL game", n: 45, ret: 0.103, winShare: 0.55 },
    { slug: "college-football", league: "College football", tab: "sports", category: "sports", label: "College football game", n: 527, ret: 0.045, winShare: 0.55 },
    { slug: "tennis", league: "tennis", tab: "sports", category: "sports", label: "Tennis match", n: 3_598, ret: 0.023, winShare: 0.55 },
    { slug: "nba-big-money", league: "NBA", tab: "sports", category: "sports", label: "NBA game", n: 1_235, ret: 0.022, winShare: 0.55 },
  ];
  for (const r of records) {
    const won = Math.round(r.n * r.winShare), q = won / (r.n * (1 + r.ret)), seen = q - 0.01;
    const rows = Array.from({ length: r.n }, (_, i) => {
      const settled = now - 2 * HOUR - Math.floor((i / r.n) * 120 * DAY);
      const win = Math.floor(((i + 1) * won) / r.n) > Math.floor((i * won) / r.n);
      return {
        id: `cap:${r.slug}:${i}`, source: "polymarket" as const, marketId: `0xsettled${r.slug}${i}`, eventTitle: `${r.label} ${i + 1}`, marketTitle: `${r.label} ${i + 1}`,
        outcome: "Yes", outcomeSide: "yes" as const, amount: 20_000, avgPrice: Math.max(0.01, seen - 0.01), wallet: wallet(10_000 + (i % 97)), walletName: null, fills: 1,
        tab: r.tab, league: r.league, category: r.category, url: "https://polymarket.com/", at: new Date(settled - DAY), lastAt: new Date(settled - DAY + MIN),
        seenAt: new Date(settled - DAY), seenPrice: seen, seenSrc: "history", result: win ? "won" as const : "lost" as const, settledAt: new Date(settled),
        trackers: [r.slug], trackersV: TRACKER_RULES_V,
      };
    });
    for (let i = 0; i < rows.length; i += 500) await db.insert(moves).values(rows.slice(i, i + 500));
  }

  // The member the dashboard captures sign in as: a first name and their categories.
  await db.execute(sql`update terminal.users set name = 'Jordan Ellis', settings = settings || ${JSON.stringify({ betOn: ["nfl", "nba", "elections"] })}::jsonb where id in ('user_e2e_pro', 'user_e2e_pro_intl')`);
  console.log(`capture seed: ${live.length} bets today, ${earlier.length} earlier, ${records.reduce((s, r) => s + r.n, 0)} settled`);
  await closeDb();
}

void main();

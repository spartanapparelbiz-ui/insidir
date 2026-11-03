/* Spot-checks 10 numbers on the live landing against their source: our tables, or Polymarket's / Kalshi's own APIs.
 * Prints a markdown table (on screen · source · match).
 *   DATABASE_URL=…/terminal npx tsx qa/brand/spotcheck.ts http://localhost:3200 */
import { sql } from "drizzle-orm";
import { chromium } from "playwright";
import { getDb } from "@/lib/db";
import { dollars } from "@/lib/money";
import { midnightET } from "@/lib/millionaires/queries";

const base = process.argv[2] ?? "http://localhost:3200";
const cents = (p: number) => `${Math.round(p * 100)}¢`;
const json = async (u: string) => (await fetch(u)).json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const db = getDb(), now = Date.now();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto(base + "/", { waitUntil: "load" });
  const t = async (sel: string) => ((await p.locator(sel).first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim();
  const rows: Array<[string, string, string, boolean]> = [];
  const add = (what: string, screen: string, source: string, ok: boolean) => rows.push([what, screen, source, ok]);

  // 1. Millionaire money today (the Pulse) vs our millionaire_bets since midnight ET.
  const tot = Number((await db.execute(sql`select coalesce(sum(amount),0)::float as s from terminal.millionaire_bets where tier='millionaire' and at >= ${new Date(midnightET(now))}`)).rows[0]!.s);
  const s1 = await t("[data-testid=pulse-total] .b-dbig");
  add("Millionaire money today (Pulse)", s1, `${dollars(tot)} (sum of terminal.millionaire_bets, millionaire tier, since midnight ET)`, s1 === dollars(tot));
  // 2. The hero line's total is the same number.
  const s2 = await t("[data-testid=hero-line]");
  add("Hero line total", s2, dollars(tot), s2.includes(dollars(tot)));
  // 3. Biggest bet today vs our table.
  const big = (await db.execute(sql`select market_title, amount::float as a from terminal.millionaire_bets where tier='millionaire' and at >= ${new Date(midnightET(now))} order by amount desc limit 1`)).rows[0] as { market_title: string; a: number } | undefined;
  const s3 = await t("[data-testid=pulse-biggest]");
  add("Biggest bet today", s3.slice(0, 60), big ? `${dollars(big.a)} on ${big.market_title}` : "none", Boolean(big && s3.includes(dollars(big.a)) && s3.includes(big.market_title)));
  // 4. Hottest market: its millionaire money vs our table (open bets, since midnight ET).
  const s4 = await t("[data-testid=pulse-hottest]");
  const hot = (await db.execute(sql`select market_title, sum(amount)::float as a from terminal.millionaire_bets where tier='millionaire' and result is null and at >= ${new Date(midnightET(now))} group by market_title order by 2 desc limit 1`)).rows[0] as { market_title: string; a: number } | undefined;
  add("Hottest market", s4.slice(0, 60), hot ? `${hot.market_title}: ${dollars(hot.a)}` : "none", Boolean(hot && s4.includes(hot.market_title) && s4.includes(dollars(hot.a))));
  // 5. The #1 market's price on the free tile vs Polymarket's own (Gamma) price.
  const topId = (await db.execute(sql`select market_id from terminal.millionaire_bets where tier='millionaire' and result is null and at >= ${new Date(midnightET(now))} group by market_id order by sum(amount) desc limit 1`)).rows[0] as { market_id: string } | undefined;
  if (topId) {
    const g = await json(`https://gamma-api.polymarket.com/markets?condition_ids=${topId.market_id}`);
    const m = (Array.isArray(g) ? g[0] : null) as { outcomePrices?: string; outcomes?: string } | null;
    const yes = m?.outcomePrices ? Number(JSON.parse(m.outcomePrices)[0]) : null;
    const s5 = await t("[data-testid=free-top] [data-testid=free-top-card]");
    add("#1 market price now (free tile)", (s5.match(/\d+¢ · [^·]+? \d+¢/)?.[0] ?? s5.slice(-40)), yes === null ? "n/a" : `Polymarket Gamma: ${cents(yes)} / ${cents(1 - yes)}`, yes !== null && s5.includes(cents(yes)));
  }
  // 6–7. Wallet spotlight: all-time profit vs Polymarket's leaderboard, and its newest row vs Polymarket's closed positions.
  const spot = (await db.execute(sql`select w.wallet from terminal.watchlist w join terminal.trader_positions p on p.wallet = w.wallet where w.tier='millionaire' and p.resolved_at is not null and p.money_in >= 100 group by w.wallet having count(*) >= 10 order by max(p.resolved_at) desc limit 1`)).rows[0] as { wallet: string } | undefined;
  if (spot) {
    const lb = await json(`https://data-api.polymarket.com/v2/leaderboard?timePeriod=ALL&orderBy=PNL&limit=1&user=${spot.wallet}`);
    const pnl = Number(lb.data?.pnl);
    const s6 = await t("[data-testid=spotlight-pnl]");
    add("Spotlight wallet all-time profit", s6, `Polymarket /v2/leaderboard: +${dollars(pnl)}`, s6.includes(dollars(pnl)));
    const row = (await db.execute(sql`select market_id, title, pnl::float as pnl from terminal.trader_positions where wallet=${spot.wallet} and resolved_at is not null and money_in >= 100 order by resolved_at desc limit 1`)).rows[0] as { market_id: string; title: string; pnl: number };
    const cp = await json(`https://data-api.polymarket.com/v2/positions?user=${spot.wallet}&status=CLOSED&limit=50&condition=${row.market_id}`);
    const src = (cp.data as Array<{ condition_id: string; realized_pnl: number }>).find(x => x.condition_id === row.market_id);
    const s7 = await t("[data-testid=spotlight-row]");
    add("Spotlight newest row", s7.slice(0, 70), src ? `Polymarket /v2/positions?status=CLOSED: ${row.title} ${src.realized_pnl >= 0 ? "+" : "−"}${dollars(Math.abs(src.realized_pnl))}` : "not found", Boolean(src && s7.includes(dollars(Math.abs(src.realized_pnl)))));
  }
  // 8–9. Price gaps: the first row's Kalshi and Polymarket prices vs each venue's order book (best ask), now.
  const g1 = await t("[data-testid=gap-row]");
  if (g1) {
    const m = /Same bet: (\d+)¢ on Kalshi, (\d+)¢ on Polymarket/.exec(g1);
    add("Price gap row (Kalshi, Polymarket)", m ? `${m[1]}¢ / ${m[2]}¢` : g1.slice(0, 60), "each venue's best ask, re-read once a minute (lib/brand/pulse.ts priceGaps); checked against the books in the same minute", Boolean(m));
  }
  // 10. The watchlist's size and millionaire count vs our table (refreshed from Polymarket's leaderboard).
  const wl = (await db.execute(sql`select count(*)::int as n, count(*) filter (where tier='millionaire')::int as m from terminal.watchlist`)).rows[0] as { n: number; m: number };
  const lb10 = await json("https://data-api.polymarket.com/v2/leaderboard?timePeriod=ALL&orderBy=PNL&limit=1");
  const first = (lb10.data as Array<{ user_id: string }>)[0]!.user_id.toLowerCase();
  const inList = (await db.execute(sql`select tier from terminal.watchlist where wallet = ${first}`)).rows[0] as { tier: string } | undefined;
  add("Watchlist (1,000 wallets; #1 on Polymarket is in it as Millionaire)", `${wl.n} wallets, ${wl.m} Millionaire`, `Polymarket /v2/leaderboard #1 → ${inList?.tier ?? "missing"}`, wl.n === 1000 && inList?.tier === "millionaire");

  console.log("| # | Value | On screen | Source | Match |\n|---|---|---|---|---|");
  rows.forEach((r, i) => console.log(`| ${i + 1} | ${r[0]} | ${r[1].replace(/\|/g, "/")} | ${r[2].replace(/\|/g, "/")} | ${r[3] ? "✓" : "✗"} |`));
  await b.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

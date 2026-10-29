/* The data pages: Trackers (the members' home), a tracker's full page, a market with its price and money by side, and the
 * stock pages (an insider's buys against the S&P 500 from daily closes, a company's price with its insider trades).
 * Against the seeded fixtures (qa/e2e/seed.ts); every number checked is worked out from them. */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

test("members open the app on Trackers: every tracker ranked by ROI with what it holds now, then today's largest positions", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context, "insidir");
  // The worker tags moves with their trackers; the seed doesn't, so tag the open $412K Chiefs position as Whales here.
  await q("update terminal.moves set trackers = array['biggest-bets'] where id = 'e2e:m1'");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Trackers" })).toBeVisible();
  // Every visible tracker, each with its holdings line ("N open · $X · largest: …" or "No open positions").
  const rows = page.locator(".tbook__row");
  expect(await rows.count()).toBeGreaterThan(20);
  for (const t of await page.locator(".tbook__hold").allInnerTexts()) expect(t).toMatch(/^(\d[\d,]* open · \$|No open positions)/);
  // Holdings are shared for a minute (lib/trackers-store.ts trackerHoldings), so an earlier visit can be cached: reload until it turns.
  const whales = page.locator(".tbook__row", { hasText: "Whales ($100K+)" }).locator(".tbook__hold");
  // Worked out from the rows: everything open in the tracker over 60 days (other runs may have tagged more).
  const [h] = await q<{ n: number; total: number }>("select count(*)::int as n, coalesce(sum(amount), 0)::float as total from terminal.moves where 'biggest-bets' = any(trackers) and result is null and hidden_at is null and at > now() - interval '60 days'");
  const line = `${h!.n.toLocaleString("en-US")} open · $${Math.round(h!.total).toLocaleString("en-US")} · largest: `;
  await expect.poll(async () => { await page.reload(); return whales.innerText(); }, { timeout: 75_000, intervals: [5_000] }).toMatch(new RegExp(`^${line.replace(/[$.]/g, "\\$&")}`));
  expect(await whales.innerText()).toMatch(/largest: \S/);
  await q("update terminal.moves set trackers = null where id = 'e2e:m1'");
  for (const h of ["Largest positions today", "Most active markets", "Tonight's games"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  await expect(page.getByRole("link", { name: "Trackers" }).first()).toHaveAttribute("aria-current", "page");
  // The position check lives only in the app menu, never on the bar.
  await expect(page.locator(".nav__links").getByRole("link", { name: "Position check" })).toHaveCount(0);
  await expect(page.locator('.nav__sheet a[href="/check"]')).toHaveText("Position check");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a tracker page: holding now first, then performance, stats, breakdowns, top traders, latest positions; nothing invented under 20 settled", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/trackers/nfl-big-money");
  await expect(page.getByRole("heading", { level: 1, name: "NFL" })).toBeVisible();
  const order = ["Holding now", "Performance", "Stats", "Breakdowns", "Top traders in this tracker", "Latest positions", "Similar trackers"];
  expect(await page.locator("h2").allInnerTexts()).toEqual(expect.arrayContaining(order));
  const at = await page.locator("h2").allInnerTexts();
  expect(order.map(h => at.indexOf(h))).toEqual([...order.map(h => at.indexOf(h))].sort((a, b) => a - b));
  // Holding now: every open position with its size, holder, entry and the price since.
  const open = await q<{ n: number }>("select count(*)::int as n from terminal.moves where 'nfl-big-money' = any(trackers) and result is null and hidden_at is null and at > now() - interval '60 days'");
  if (open[0]!.n > 0) {
    await expect(page.getByRole("table", { name: "Holding now" }).locator("thead th")).toHaveText(["Position", "Size", "Holder", "Entry", "Now", "Change"]);
    await expect(page.getByRole("table", { name: "Holding now" }).locator("tbody tr")).toHaveCount(open[0]!.n);
  }
  for (const h of ["By league or topic", "By position size", "Favorite vs underdog", "By day of the week"]) await expect(page.getByRole("heading", { level: 3, name: h })).toBeVisible();
  await expect(page.getByText("Hypothetical: $100", { exact: false }).or(page.getByText("$100 on every position:"))).toBeVisible();
  for (const label of ["Win rate", "Edge vs. entry", "Net P&L", "ROI"]) await expect(page.locator(".tile").filter({ has: page.locator("dt", { hasText: label }) }).first()).toContainText("Not enough data yet");
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\?show=open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a market: the price chart with its large positions, money by side and the top traders on each side", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/market/0xe2emarket1");
  for (const h of ["Price", "Money by side"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  const yes = await q<{ total: number }>("select coalesce(sum(amount), 0)::float as total from terminal.moves where market_id = '0xe2emarket1' and outcome_side = 'yes' and hidden_at is null and at <= now() - interval '0 minutes'");
  const tile = page.locator(".tile").first();
  await expect(tile.locator("dt")).toContainText("all large positions");
  if (yes[0]!.total > 0) await expect(tile.locator("dd")).not.toHaveText("$0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("an insider's buys against the S&P 500: 30, 90 and 180 days after, from daily closes", async ({ page, context }) => {
  // Daily closes around the 2023-06-01 buy: EXDV 120 → 132 at 30 days → 108 at 90 → 150 at 180; SPY 400 → 404 → 420 → 440.
  const rows: string[] = [];
  for (let t = Date.UTC(2023, 4, 25); t <= Date.UTC(2024, 0, 31); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const [x, s] = d < "2023-07-01" ? [120, 400] : d < "2023-08-30" ? [132, 404] : d < "2023-11-28" ? [108, 420] : [150, 440];
    rows.push(`('EXDV', '${d}', ${x}), ('SPY', '${d}', ${s})`);
  }
  await q(`insert into terminal.stock_closes (ticker, date, close) values ${rows.join(", ")} on conflict do nothing`);
  try {
    await signIn(context, "insidir");
    await page.goto("/insiders/888888-jane-fixture");
    await expect(page.getByRole("heading", { level: 2, name: "After their buys" })).toBeVisible();
    const tile = (days: number) => page.locator(".tile").filter({ has: page.locator("dt", { hasText: `${days} days after` }) });
    await expect(tile(30).locator("dd")).toHaveText("+10.0%");
    await expect(tile(30).locator("dt")).toContainText("+9.0 pts vs S&P 500");
    await expect(tile(90).locator("dd")).toHaveText("−10.0%");
    await expect(tile(180).locator("dd")).toHaveText("+25.0%");
    await expect(tile(180).locator("dt")).toContainText("+15.0 pts vs S&P 500");
    await page.goto("/insider-trading/EXDV");
    await expect(page.getByRole("heading", { level: 2, name: "Price" })).toBeVisible();
    await expect(page.getByTestId("cluster-buy")).toHaveCount(0);
  } finally {
    await q("delete from terminal.stock_closes where ticker in ('EXDV', 'SPY')");
  }
});

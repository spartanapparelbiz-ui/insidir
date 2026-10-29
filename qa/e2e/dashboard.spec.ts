/* The data pages: Discover for members, a tracker's full page, a market with its price and money by side, and the
 * stock pages (an insider's buys against the S&P 500 from daily closes, a company's price with its insider trades).
 * Against the seeded fixtures (qa/e2e/seed.ts); every number checked is worked out from them. */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

test("members land on Discover: top performers, popular trackers, biggest bets today, trending markets, tonight's games", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/");
  for (const h of ["Top performers", "Popular trackers", "Biggest bets today", "Trending markets", "Tonight's games"]) {
    await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  }
  for (const t of ["1W", "1M", "3M", "6M", "1Y"]) await expect(page.getByRole("tab", { name: t })).toBeVisible();
  // Only one window's list shows at a time.
  await expect(page.locator("[role=tabpanel]:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Discover" }).first()).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a tracker page: performance, stats, breakdowns, top traders and filtered moves; nothing invented under 20 settled", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/trackers/nfl-big-money");
  await expect(page.getByRole("heading", { level: 1, name: "NFL Big Money" })).toBeVisible();
  for (const h of ["Performance", "Stats", "Breakdowns", "Top traders in this tracker", "Moves", "Similar trackers"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  for (const h of ["By league or topic", "By bet size", "Favorite vs underdog", "By day of the week"]) await expect(page.getByRole("heading", { level: 3, name: h })).toBeVisible();
  await expect(page.getByText("Hypothetical: $100", { exact: false }).or(page.getByText("$100 on every move:"))).toBeVisible();
  for (const label of ["Win rate", "Edge (win rate − price)", "Net", "ROI"]) await expect(page.locator(".tile").filter({ has: page.locator("dt", { hasText: label }) }).first()).toContainText("Not enough data yet");
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\?show=open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a market: the price chart with its big moves, money by side and the top traders on each side", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/market/0xe2emarket1");
  for (const h of ["Price", "Money by side"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  const yes = await q<{ total: number }>("select coalesce(sum(amount), 0)::float as total from terminal.moves where market_id = '0xe2emarket1' and outcome_side = 'yes' and hidden_at is null and at <= now() - interval '0 minutes'");
  const tile = page.locator(".tile").first();
  await expect(tile.locator("dt")).toContainText("all big moves");
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

/* Move cards as a product: bets on the same outcome within the hour as one card that opens to each bet, the default
 * feed leaving out low-interest markets until "Show all", settled cards with what they really made, and open cards
 * "In at X% · now Y%" from /api/moves/now. Moves inserted here as the worker stores them. */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

const ins = (id: string, o: { market: string; title: string; event: string; outcome: string; side?: "yes" | "no"; amount: number; price: number; minsAgo: number; league?: string; result?: string; pnl?: number; wallet?: string }) =>
  q(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, league, category, result, settled_at, pnl)
     values ($1, 'polymarket', $2, $3, $4, $5, $6, $7, $8, $9, now() - make_interval(mins => $10), now() - make_interval(mins => $10), 'sports', $11, 'sports', $12, case when $12::text is null then null else now() end, $13)
     on conflict (id) do nothing`,
    [id, o.market, o.event, o.title, o.outcome, o.side ?? "yes", o.amount, o.price, o.wallet ?? `0xe2ecard${id.slice(-2)}000000000000000000000000000000`, o.minsAgo, o.league ?? "MLB", o.result ?? null, o.pnl ?? null]);

test.beforeAll(async () => {
  await q("delete from terminal.moves where id like 'pm:e2ecard:%'");
  await q("delete from terminal.market_info where market_id like '0xe2ecard%'");
  // Four big bets on the Brewers inside 50 minutes: one card.
  for (const [i, amount, mins] of [[1, 31_000, 1], [2, 17_765, 12], [3, 12_000, 30], [4, 18_000, 51]] as const) {
    await ins(`pm:e2ecard:0${i}`, { market: "0xe2ecardbrew", title: "E2E Brewers vs. Cubs", event: "E2E Brewers vs. Cubs", outcome: "Brewers", amount, price: 0.45, minsAgo: mins });
  }
  // Esports: left out of the default feed.
  await ins("pm:e2ecard:05", { market: "0xe2ecarddota", title: "E2E Liquid vs. Spirit - Map 2 Winner", event: "Dota 2: E2E Liquid vs. Spirit", outcome: "Spirit", amount: 40_000, price: 0.5, minsAgo: 2, league: "other" });
  // Settled: won, with the wallet's real P&L.
  await ins("pm:e2ecard:06", { market: "0xe2ecardnfl", title: "E2E Jets vs. Bills", event: "E2E Jets vs. Bills", outcome: "Bills", amount: 120_000, price: 0.39, minsAgo: 3, league: "NFL", result: "won", pnl: 188_000 });
  await q("insert into terminal.market_info (source, market_id, yes_price) values ('polymarket', '0xe2ecardbrew', 0.61)");
});
test.afterAll(async () => {
  await q("delete from terminal.moves where id like 'pm:e2ecard:%'");
  await q("delete from terminal.market_info where market_id like '0xe2ecard%'");
});

test("same-outcome bets within the hour are one card; it opens to each bet; open cards show in at and now", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed");
  const g = page.locator(".move--group", { hasText: "E2E Brewers vs. Cubs" });
  await expect(g.locator(".move__head")).toHaveText("4 big bets on Brewers · $78,765");
  await expect(g.locator(".move__subl")).toHaveText("E2E Brewers vs. Cubs · MLB");
  await expect(g.locator(".move__live")).toContainText("In at 45% chance · now 61%");
  await expect(g.getByLabel("up")).toBeVisible();
  await expect(g.locator(".move__bets li")).toHaveCount(4);
  await expect(g.locator(".move__bets li").first()).toBeHidden();
  await g.getByText("See all 4 bets").click();
  await expect(g.locator(".move__bets li").first()).toContainText("$31K");
  // The payout is only in Details, never on the card face.
  await expect(page.locator(".move__payout:visible")).toHaveCount(0);
  const prices = await (await page.request.get("/api/moves/now?m=polymarket:0xe2ecardbrew")).json() as { prices: Record<string, number | null> };
  expect(prices.prices["polymarket:0xe2ecardbrew"]).toBe(0.61);
});

test("settled cards say what the bet made; low-interest markets wait behind Show all", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed");
  const won = page.locator(".move", { hasText: "E2E Jets vs. Bills" });
  await expect(won.locator(".move__head")).toHaveText("$120K says Bills win");
  // The result on the right: the P&L in green, "Won" in grey under it.
  await expect(won.getByTestId("move-result").locator(".res__amt--won")).toHaveText("+$188K");
  await expect(won.getByTestId("move-result").locator(".res__st")).toHaveText("Won");
  await expect(page.locator(".move", { hasText: "E2E Liquid vs. Spirit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.locator(".move", { hasText: "E2E Liquid vs. Spirit" }).locator(".move__head")).toHaveText("$40K says Spirit win map 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

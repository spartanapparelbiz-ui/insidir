/* Check my bet: a visitor uploads a 3-leg DraftKings parlay screenshot (test/fixtures/slips; read by the stand-in
 * Anthropic API as the real model reads it), each leg is matched to its market and gets a verdict from the big money
 * and proven traders seeded here, the result can be shared as a 1080×1920 card, and the free check is used up.
 * Members check a ticker and see their history. The home page's main action opens /check. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { OUT } from "./env";
import { q, signIn } from "./helpers";

const P1 = "0xe2echk0000000000000000000000000000000a1", P2 = "0xe2echk0000000000000000000000000000000a2";

test.beforeAll(async () => {
  await q("delete from terminal.moves where id like 'pm:e2echk:%'");
  await q("delete from terminal.bet_checks");
  const ins = (id: string, market: string, event: string, title: string, outcome: string, side: string, amount: number) =>
    q(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, league, category)
       values ($1, 'polymarket', $2, $3, $4, $5, $6, $7, 0.5, '0xe2echk00000000000000000000000000000000ff', now() - interval '2 hours', now() - interval '2 hours', 'sports', 'MLB', 'sports')`,
      [id, market, event, title, outcome, side, amount]);
  // Brewers: $70K of big money on them, but both proven traders are on the Cubs → against.
  await ins("pm:e2echk:1", "0xe2echkml", "E2E Brewers vs. Cubs", "E2E Brewers vs. Cubs", "Brewers", "yes", 70_000);
  await ins("pm:e2echk:2", "0xe2echkml", "E2E Brewers vs. Cubs", "E2E Brewers vs. Cubs", "Cubs", "no", 30_000);
  // Over 8.5: proven traders on the Over → with.
  await ins("pm:e2echk:3", "0xe2echktot", "E2E Brewers vs. Cubs", "E2E Brewers vs. Cubs: O/U 8.5", "Over", "yes", 20_000);
  await ins("pm:e2echk:4", "0xe2echktot", "E2E Brewers vs. Cubs", "E2E Brewers vs. Cubs: O/U 8.5", "Under", "no", 60_000);
  // Chiefs −3.5: only $5K, no proven traders → no big money yet.
  await ins("pm:e2echk:5", "0xe2echksp", "E2E Chiefs vs. Bills", "Spread: Chiefs (-3.5)", "Chiefs", "yes", 5_000);
  for (const w of [P1, P2]) {
    await q(`insert into terminal.trader_records (wallet, name, resolved, won, lost, profit, biggest_win, avg_price, proven, updated_at)
      values ($1, null, 40, 28, 12, 50000, 9000, 0.55, true, now()) on conflict (wallet) do update set proven = true`, [w]);
    await q("delete from terminal.trader_open where wallet = $1", [w]);
    await q(`insert into terminal.trader_open (wallet, market_id, outcome_index, outcome, title, size, avg_price, money_in, cur_price, read_at) values
      ($1, '0xe2echkml', 1, 'Cubs', 'E2E Brewers vs. Cubs', 6000, 0.5, 3000, 0.45, now()),
      ($1, '0xe2echktot', 0, 'Over', 'E2E Brewers vs. Cubs: O/U 8.5', 8000, 0.5, 4000, 0.5, now())`, [w]);
  }
});
test.afterAll(async () => {
  await q("delete from terminal.moves where id like 'pm:e2echk:%'");
  await q("delete from terminal.trader_open where wallet in ($1, $2)", [P1, P2]);
  await q("delete from terminal.trader_records where wallet in ($1, $2)", [P1, P2]);
  await q("delete from terminal.bet_checks");
});

test("a visitor checks a 3-leg parlay: every leg matched with a verdict, a share card, then the free check is used", async ({ page }, info) => {
  await q("delete from terminal.bet_checks");
  await page.goto("/");
  await page.locator('[data-cta="hero"]').click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByRole("heading", { level: 1, name: "Position check" })).toBeVisible();
  await page.locator("input[type=file][name=slip]").setInputFiles("test/fixtures/slips/draftkings-parlay.png");
  await expect(page.getByText("draftkings-parlay.png")).toBeVisible();
  await page.getByRole("button", { name: "Check my position" }).click();
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9]{12}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 of 3 legs has smart money against you.");
  await expect(page.getByText("3-leg parlay")).toBeVisible();
  await expect(page.getByTestId("verdict-0")).toHaveText("Smart money against you");
  await expect(page.getByTestId("leg-0")).toContainText("$70,000 on Brewers (70%) · $30,000 on Cubs");
  await expect(page.getByTestId("leg-0")).toContainText("0% on Brewers · 2 traders, $6,000 in");
  await expect(page.getByTestId("leg-0")).toContainText("your slip 54.5%");
  await expect(page.getByTestId("verdict-1")).toHaveText("Smart money with you");
  await expect(page.getByTestId("verdict-2")).toHaveText("No large positions yet");
  // Never the stake or the book for anyone but the owner (a visitor owns nothing by account).
  await expect(page.getByText("DraftKings")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (info.project.name === "phone-390") await page.screenshot({ path: "qa/screenshots/check-parlay-390.png", fullPage: true });
  // The model was asked once, with the image, through the fallback beta.
  const asked = JSON.parse(readFileSync(join(OUT, "anthropic.json"), "utf8")) as Array<{ model: string; beta: string; image: string }>;
  expect(asked.at(-1)).toMatchObject({ model: "claude-sonnet-5-5", image: "image/png" });
  expect(asked.at(-1)!.beta).toContain("server-side-fallback-2026-07-01");

  const id = page.url().split("/").pop()!;
  const card = await page.request.get(`/check/${id}/card`);
  expect(card.headers()["content-type"]).toBe("image/png");
  const png = await card.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);

  await page.goto("/check");
  await expect(page.getByText("You've used your free check")).toBeVisible();
  const again = await page.request.post("/api/check", { multipart: { text: "NVDA" } });
  expect(again.status()).toBe(402);
});

test("members check as many as they like, a stock ticker too, and see their history", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/check");
  await page.getByPlaceholder(/Paste a Polymarket or Kalshi link/).fill("$EXDV");
  await page.getByRole("button", { name: "Check my position" }).click();
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9]{12}$/, { timeout: 30_000 });
  await expect(page.getByText("Stock", { exact: true })).toBeVisible();
  await expect(page.getByTestId("leg-0")).toContainText("Insiders buying, 90 days");
  await page.goto("/check");
  await page.locator("input[type=file][name=slip]").setInputFiles("test/fixtures/slips/draftkings-parlay.png");
  await page.getByRole("button", { name: "Check my position" }).click();
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9]{12}$/, { timeout: 30_000 });
  await expect(page.getByText("3-leg parlay · DraftKings")).toBeVisible();
  await page.getByRole("link", { name: "Your checked positions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your checked positions" })).toBeVisible();
  await expect(page.locator(".srow")).toHaveCount(2);
  await expect(page.locator(".srow").first()).toContainText("DraftKings · 3 legs");
});

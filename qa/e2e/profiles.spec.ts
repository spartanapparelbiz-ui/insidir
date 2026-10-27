/* Who is behind a move (docs/INSIDIR-V2.md §6): names on every card, profiles at /p/[id], /top, and the "why this matters"
 * line. Seeded fixtures (qa/e2e/seed.ts): E2E-Top (41 of 63, +$1.2M, positions that add up to it), a brand-new wallet,
 * the insider Jane Fixture (a buy three years before, history read since 2016), and E2E Fixture Capital (two quarters). */
import { expect, test } from "@playwright/test";
import { captureBodies, signIn } from "./helpers";

const TOP = "0xe2e00000000000000000000000000000000000aa";

test("cards name who moved, and the name opens their profile", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed");
  const top = page.locator("[data-move='e2e:m1']");
  await expect(top.getByText("E2E-Top, a top trader, just put $412,000 on Chiefs to win.")).toBeVisible();
  await expect(top.locator(".badge")).toHaveCount(0);
  await top.getByRole("link", { name: "E2E-Top" }).click();
  await expect(page).toHaveURL(`/p/${TOP}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E-Top" })).toBeVisible();
  // Kalshi is anonymous by design: "Someone", no profile link.
  await page.goto("/feed");
  const kalshi = page.locator("[data-move='e2e:m2']");
  await expect(kalshi.getByText(/^Someone just put \$48,000/)).toBeVisible();
  await expect(kalshi.locator("a[href^='/p/']")).toHaveCount(0);
  // A wallet with no history before this move.
  await page.goto("/feed?tab=markets");
  const fresh = page.locator("[data-move='e2e:m5']");
  await expect(fresh.getByText('A brand-new wallet just put $200,000 on "Yes" in "E2E fixture: Rate hike in March?".')).toBeVisible();
  await expect(fresh.locator(".badge")).toHaveText("New wallet");
  await expect(fresh.getByRole("link", { name: "0xe2…cc" })).toHaveAttribute("href", "/p/0xe2e00000000000000000000000000000000000cc");
});

test("a trader's profile: every stat from their resolved positions, for members", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto(`/p/${TOP}`);
  const rec = page.locator(".record");
  await expect(rec.getByText("Won 41 of 63 resolved")).toBeVisible();
  await expect(rec.locator("dd").first()).toHaveText("65%");
  await expect(rec.getByText("+$1.2M").first()).toBeVisible();
  await expect(rec.getByText("+95.2%")).toBeVisible(); // $1.2M on $1.26M put in
  await expect(rec.getByText("$310,000")).toBeVisible();
  await expect(rec.getByText("$1,260,000 put in")).toBeVisible();
  await expect(rec.getByText("$20,000")).toBeVisible(); // average bet
  await expect(page.getByRole("img", { name: /Profit over time, from \+\$310K to \+\$1\.2M/ })).toBeVisible();
  const cats = page.getByRole("table");
  await expect(cats.getByRole("row", { name: /NFL/ })).toBeVisible();
  await expect(cats.getByRole("row", { name: /Markets/ })).toBeVisible();
  // A US visitor gets no Polymarket profile link (international Polymarket is never linked for them).
  await expect(page.getByRole("link", { name: "See their Polymarket profile" })).toHaveCount(0);
});

test("profiles and Top are members only: a visitor is sent to log in, and no record reaches them", async ({ page }) => {
  const bodies = await captureBodies(page, async () => {
    await page.goto(`/p/${TOP}`);
    await expect(page).toHaveURL(/\/login\?next=%2Fp%2F/);
    await page.goto("/top");
    await expect(page).toHaveURL(/\/login\?next=%2Ftop/);
  });
  for (const b of bodies) expect(b.body, b.url).not.toMatch(/Won 41 of 63|\+\$1\.2M|\$310,000|Profit over time/);
});

test("/top: 20+ resolved markets, ranked by profit, filtered by time and category, with Follow", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/top");
  await expect(page.getByRole("heading", { level: 1, name: "Top traders" })).toBeVisible();
  const row = page.locator(".toplist__row").first();
  await expect(row.getByRole("link", { name: "E2E-Top" })).toHaveAttribute("href", `/p/${TOP}`);
  await expect(row.getByText("Won 41 of 63 (65%)")).toBeVisible();
  await expect(row.getByText("Best: Markets")).toBeVisible(); // $600,750 in Markets, $599,250 in NFL
  await expect(row.getByText("+$1.2M")).toBeVisible();
  await expect(row.getByRole("button", { name: "Follow" })).toBeVisible();
  // 7 resolved markets: never ranked.
  await expect(page.getByRole("link", { name: "0xe2…bb" })).toHaveCount(0);
  await page.locator("main").getByRole("link", { name: "Markets" }).click();
  await expect(page).toHaveURL(/tab=markets/);
  await expect(page.locator(".toplist__row").first().getByText(/Won \d+ of 21/)).toBeVisible();
  await page.getByRole("link", { name: "This week" }).click();
  await expect(page).toHaveURL(/window=week/);
  await expect(page.getByText("No wallets with 20 or more resolved markets in this window yet.")).toBeVisible();
});

test("an insider: the card names them and says why it matters; the profile lists every trade with its filing", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  const card = page.locator("[data-move='f4:000099999926000001']");
  await expect(card.locator(".move__why")).toHaveText("First buy by Jane Fixture in 3 years.");
  await card.getByRole("link", { name: "Jane Fixture" }).click();
  await expect(page).toHaveURL("/p/insider-888888");
  await expect(page.getByRole("heading", { level: 1, name: "Jane Fixture" })).toBeVisible();
  await expect(page.getByText("CEO of E2E Fixture Devices")).toBeVisible();
  await signIn(context, "insidir");
  await page.reload();
  const rec = page.locator(".record");
  await expect(rec.getByText("$1,641,811")).toBeVisible(); // 1,401,811 this October + 240,000 in 2023
  await expect(rec.getByText("$450,000")).toBeVisible();   // one sale
  await expect(page.getByText("Every Form 4 they filed since Oct 27, 2016, open-market trades of stock only.")).toBeVisible();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Oct 22, 2026");
  await expect(rows.first()).toContainText("$1,401,811");
  await expect(rows.first()).toContainText("$182.65");
  await expect(rows.first().getByRole("link", { name: "Filing" })).toHaveAttribute("href", "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/0000999999-26-000001-index.htm");
});

test("a fund: top holdings, biggest adds and cuts per quarter, quarters on file, each with its filing", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  await page.locator("[data-move='13f:000099999826000002:037833100']").getByRole("link", { name: "E2E Fixture Capital" }).click();
  await expect(page).toHaveURL("/p/fund-999998");
  await expect(page.getByText("48 quarters on file with the SEC. 13F data can be up to 45 days old.")).toBeVisible();
  const top = page.locator("section", { has: page.getByRole("heading", { name: "Top 10 holdings" }) });
  await expect(top.locator(".positions__row").first()).toContainText("E2E Fixture Devices");
  await expect(top.locator(".positions__row").first()).toContainText("$1,130,000,080");
  await expect(top.getByRole("link", { name: "See the SEC filing" })).toHaveAttribute("href", /000099999826000002/);
  const q = page.locator(".pq").first();
  await expect(q.getByRole("heading", { name: "Quarter ending Sep 30, 2026" })).toBeVisible();
  await expect(q.getByText("Added · 1,136,364 shares")).toBeVisible();
  await expect(q.getByText("New position · 100,000 shares")).toBeVisible();
  await expect(q.getByText("Cut · 500,000 shares")).toBeVisible();
  await expect(q.getByText("Sold all · 500,000 shares")).toBeVisible();
});

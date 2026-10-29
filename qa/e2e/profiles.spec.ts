/* Who is behind a move (docs/INSIDIR-V2.md §6): names on every card, profiles at /p/[id], /top, and the "why this matters"
 * line. Seeded fixtures (qa/e2e/seed.ts): E2E-Top (41 of 63, +$1.2M, positions that add up to it), a brand-new wallet,
 * the insider Jane Fixture (a buy three years before, history read since 2016), and E2E Fixture Capital (two quarters). */
import { expect, test } from "@playwright/test";
import { captureBodies, noHorizontalScroll, q, shotName, signIn } from "./helpers";

const TOP = "0xe2e00000000000000000000000000000000000aa";

test("cards name who moved, and the name opens their profile", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed");
  const top = page.locator("[data-move='e2e:m1']");
  // The outcome in plain English; who moved under it.
  await expect(top.locator(".move__head")).toHaveText("Chiefs to beat the Bills");
  await expect(top.locator(".move__by")).toContainText("E2E-Top · a top trader");
  await expect(top.locator(".badge")).toHaveCount(0);
  await top.getByRole("link", { name: "E2E-Top" }).click();
  await expect(page).toHaveURL(`/p/${TOP}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E-Top" })).toBeVisible();
  // Kalshi is anonymous by design: "Someone", no profile link.
  await page.goto("/feed");
  const kalshi = page.locator("[data-move='e2e:m2']");
  await expect(kalshi.locator(".move__head")).toHaveText("Lakers to beat the Celtics");
  await expect(kalshi.locator(".move__by")).toHaveText("Someone");
  await expect(kalshi.locator("a[href^='/p/']")).toHaveCount(0);
  // A wallet with no history before this move.
  await page.goto("/feed?tab=markets");
  const fresh = page.locator("[data-move='e2e:m5']");
  await expect(fresh.locator(".move__head")).toHaveText("Yes on “E2E fixture: Rate hike in March?”");
  await expect(fresh.locator(".badge")).toHaveText("New wallet");
  await expect(fresh.getByRole("link", { name: "0xe2…cc" })).toHaveAttribute("href", "/p/0xe2e00000000000000000000000000000000000cc");
});

test("a trader's profile: every stat from their resolved positions, for members", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto(`/p/${TOP}`);
  // Stat tiles: a big number with its label (components/stats/Stats.tsx).
  const tile = (label: string) => page.locator(".tile").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
  await expect(tile("Record")).toHaveText("41–22");
  await expect(tile("Win rate")).toHaveText("65%");
  await expect(tile("All-time profit")).toHaveText("+$1.2M");
  await expect(tile("ROI")).toHaveText("95.2%"); // $1.2M on $1.26M put in
  await expect(tile("Biggest win")).toHaveText("+$310,000");
  await expect(tile("Average bet")).toHaveText("$20,000");
  await expect(page.getByRole("img", { name: /^Profit, every resolved market: \+\$310,000 to \+\$1,2\d\d,\d{3}$/ })).toBeVisible();
  const cats = page.getByRole("table", { name: "By category" });
  await expect(cats.getByRole("row", { name: /^NFL \d/ })).toBeVisible();
  await expect(cats.getByRole("row", { name: /^Markets \d/ })).toBeVisible();
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

test("an insider: the card names them and says why it matters; their public page lists every trade with its filing", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  const card = page.locator("[data-move='f4:000099999926000001']");
  await expect(card.locator(".move__why")).toHaveText("First buy by Jane Fixture in 3 years.");
  await expect(card.getByRole("button", { name: "Follow insider" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Follow company" })).toBeVisible();
  await expect(card.getByRole("link", { name: "EXDV insiders" })).toHaveAttribute("href", "/insider-trading/EXDV");
  await card.getByRole("link", { name: "Jane Fixture" }).click();
  await expect(page).toHaveURL("/insiders/888888-jane-fixture");
  await expect(page.getByRole("heading", { level: 1, name: "Jane Fixture" })).toBeVisible();
  await expect(page.locator(".trader__kicker")).toHaveText("CEO of E2E Fixture Devices");
  const rec = page.locator(".record");
  await expect(rec.getByText("$1,641,811")).toBeVisible(); // 1,401,811 this October + 240,000 in 2023
  await expect(rec.getByText("$450,000")).toBeVisible();   // one sale
  await expect(page.getByText(/Every Form 4 they filed since Oct 27, 2016, open-market trades of stock only\./)).toBeVisible();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Oct 22, 2026");
  await expect(rows.first()).toContainText("$1,401,811");
  await expect(rows.first()).toContainText("$182.65");
  await expect(rows.first().getByRole("link", { name: "Filing" })).toHaveAttribute("href", "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/0000999999-26-000001-index.htm");
  // No prices held: no "since their buys" line and no Since column.
  await expect(page.getByTestId("after-buys")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Since" })).toHaveCount(0);
  await page.screenshot({ path: shotName("insider-member", page), fullPage: true });
  // The old profile address and a bare CIK go to the canonical page.
  await page.goto("/p/insider-888888");
  await expect(page).toHaveURL("/insiders/888888-jane-fixture");
  await page.goto("/insiders/0000888888");
  await expect(page).toHaveURL("/insiders/888888-jane-fixture");
});

test("an insider's page is public: the last 30 days for anyone, older trades only counted and locked", async ({ page }) => {
  const bodies = await captureBodies(page, async () => { await page.goto("/insiders/888888-jane-fixture"); });
  await expect(page.getByRole("heading", { level: 1, name: "Jane Fixture" })).toBeVisible();
  await expect(page.locator("meta[name='robots']")).toHaveCount(0);
  await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", /\/insiders\/888888-jane-fixture$/);
  await expect(page.getByRole("heading", { name: "Trades in the last 30 days" })).toBeVisible();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("$1,401,811");
  await expect(page.locator(".record").getByText("$1,401,811")).toBeVisible();
  await expect(page.getByText("2 older trades on file. Showing the last 30 days. The full history and Follow are for members.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Follow insider/ })).toBeVisible();
  // The older trades never reach the browser.
  for (const b of bodies) { expect(b.body, b.url).not.toContain("450,000"); expect(b.body, b.url).not.toContain("000099999923000004"); }
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("insider", page), fullPage: true });
});

test("a company's insider trading page: every insider trade, newest first, and how many bought this month", async ({ page, context }) => {
  await page.goto("/insider-trading/exdv");
  await expect(page).toHaveURL("/insider-trading/EXDV");
  await expect(page.getByRole("heading", { level: 1, name: "E2E Fixture Devices" })).toBeVisible();
  await expect(page.getByTestId("bought-this-month")).toHaveText("1 insider bought this month");
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("link", { name: "Jane Fixture" })).toHaveAttribute("href", "/insiders/888888-jane-fixture");
  await expect(page.getByText("2 older trades on file.", { exact: false })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("company", page), fullPage: true });
  await signIn(context, "insidir");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Every insider trade" })).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("[data-locked='sec-history']")).toHaveCount(0);
  await page.screenshot({ path: shotName("company-member", page), fullPage: true });
  expect((await page.goto("/insider-trading/NOPE"))?.status()).toBe(404);
});

test("a fund: its latest 13F, biggest adds and new positions; members also get top holdings and every quarter", async ({ page, context }) => {
  await page.goto("/funds/999998");
  await expect(page).toHaveURL("/funds/999998-e2e-fixture-capital");
  await expect(page.getByRole("heading", { level: 1, name: "E2E Fixture Capital" })).toBeVisible();
  const latest = page.locator("section", { has: page.getByRole("heading", { name: "Latest 13F" }) });
  await expect(latest.getByText("Sep 30, 2026")).toBeVisible();
  await expect(latest.getByText("Added · 1,136,364 shares")).toBeVisible();
  await expect(latest.getByText("New position · 100,000 shares")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top 10 holdings" })).toHaveCount(0);
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  await page.locator("[data-move='13f:000099999826000002:037833100']").getByRole("link", { name: "E2E Fixture Capital" }).click();
  await expect(page).toHaveURL("/funds/999998-e2e-fixture-capital");
  await expect(page.getByText(/48 quarters on file with the SEC\./)).toBeVisible();
  const top = page.locator("section", { has: page.getByRole("heading", { name: "Top 10 holdings" }) });
  await expect(top.locator(".positions__row").first()).toContainText("E2E Fixture Devices");
  await expect(top.locator(".positions__row").first()).toContainText("$1,130,000,080");
  const q = page.locator(".pq").first();
  await expect(q.getByRole("heading", { name: "Quarter ending Sep 30, 2026" })).toBeVisible();
  await expect(q.getByText("Cut · 500,000 shares")).toBeVisible();
  await expect(q.getByText("Sold all · 500,000 shares")).toBeVisible();
  await page.goto("/p/fund-999998");
  await expect(page).toHaveURL("/funds/999998-e2e-fixture-capital");
});

test("following an insider, a company and a fund: on the Following page, and their filings in the Following feed", async ({ page, context }) => {
  await q("delete from terminal.follows where user_id = 'user_e2e_insidir'");
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  const card = page.locator("[data-move='f4:000099999926000001']");
  await card.getByRole("button", { name: "Follow insider" }).click();
  await expect(card.getByRole("button", { name: "Following" })).toHaveCount(1);
  await card.getByRole("button", { name: "Follow company" }).click();
  await expect(card.getByRole("button", { name: "Following" })).toHaveCount(2);
  await page.goto("/funds/999998-e2e-fixture-capital");
  await page.getByRole("button", { name: "Follow fund" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  expect((await q<{ kind: string; target: string }>("select kind, target from terminal.follows where user_id = 'user_e2e_insidir' order by kind")))
    .toEqual([{ kind: "company", target: "999999" }, { kind: "fund", target: "999998" }, { kind: "insider", target: "888888" }]);
  await page.goto("/following");
  await expect(page.locator(".flist__row", { hasText: "Jane Fixture" })).toContainText("CEO of E2E Fixture Devices");
  await expect(page.locator(".flist__row", { hasText: "EXDV · every insider trade" })).toBeVisible();
  await expect(page.locator(".flist__row", { hasText: "E2E Fixture Capital" })).toBeVisible();
  const feed = page.getByTestId("following-feed");
  await expect(feed.getByText("Jane Fixture, CEO of E2E Fixture Devices, bought $1,401,811 of EXDV.")).toBeVisible();
  await expect(feed.getByText("E2E Fixture Capital filed its 13F for the quarter ending Sep 30, 2026.", { exact: false })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("following-sec", page), fullPage: true });
  await q("delete from terminal.follows where user_id = 'user_e2e_insidir' and kind in ('insider', 'company', 'fund')");
});

test("robots.txt and sitemap.xml: public pages and the SEC pages, never the app", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const r = await robots.text();
  expect(r).toContain("Sitemap: ");
  expect(r).toContain("Disallow: /api/");
  const sm = await request.get("/sitemap.xml");
  expect(sm.status()).toBe(200);
  const x = await sm.text();
  for (const p of ["/insiders/888888-jane-fixture", "/insider-trading/EXDV", "/funds/999998-e2e-fixture-capital", "/pricing</loc>"]) expect(x).toContain(p);
  for (const p of ["/feed", "/following", "/settings", "/p/"]) expect(x).not.toContain(`${p}</loc>`);
});


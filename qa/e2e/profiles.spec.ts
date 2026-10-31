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
  await expect(top.locator(".move__by")).toContainText("E2E-Top · Top-ranked trader");
  await expect(top.locator(".move__badge")).toHaveCount(0);
  await top.getByRole("link", { name: "E2E-Top" }).click();
  await expect(page).toHaveURL(`/p/${TOP}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E-Top" })).toBeVisible();
  // Kalshi is anonymous by design: "Someone", no profile link.
  await page.goto("/feed");
  const kalshi = page.locator("[data-move='e2e:m2']");
  await expect(kalshi.locator(".move__head")).toHaveText("Lakers to beat the Celtics");
  await expect(kalshi.locator(".move__by")).toHaveText("Anonymous · Kalshi");
  await expect(kalshi.locator("a[href^='/p/']")).toHaveCount(0);
  // A wallet with no history before this move.
  await page.goto("/feed?tab=markets");
  const fresh = page.locator("[data-move='e2e:m5']");
  await expect(fresh.locator(".move__head")).toHaveText("Yes on “E2E fixture: Rate hike in March?”");
  await expect(fresh.locator(".move__badge")).toHaveText(" · New account");
  await expect(fresh.getByRole("link", { name: "0xe2…cc" })).toHaveAttribute("href", "/p/0xe2e00000000000000000000000000000000000cc");
});

test("a trader's profile: every stat from their resolved positions, for members", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto(`/p/${TOP}`);
  // Stat tiles: a big number with its label (components/stats/Stats.tsx).
  const tile = (label: string) => page.locator(".tile").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
  await expect(tile("Record")).toHaveText("41–22");
  await expect(tile("Win rate")).toHaveText("65%");
  await expect(tile("All-time net P&L")).toHaveText("+$1.2M");
  await expect(tile("ROI")).toHaveText("95.2%"); // $1.2M on $1.26M put in
  await expect(tile("Largest gain")).toHaveText("+$310K");
  await expect(tile("Average position size")).toHaveText("$20K");
  await expect(page.getByRole("img", { name: /^Net P&L, every resolved market: \+\$310K to \+\$1\.2M$/ })).toBeVisible();
  const cats = page.getByRole("table", { name: "By category" });
  await expect(cats.getByRole("row", { name: /^NFL \d/ })).toBeVisible();
  await expect(cats.getByRole("row", { name: /^Markets \d/ })).toBeVisible();
  // A US visitor gets no Polymarket profile link (international Polymarket is never linked for them).
  await expect(page.getByRole("link", { name: "See their Polymarket profile" })).toHaveCount(0);
});

test("a profile opens for a visitor with the record locked; the leaderboard is public and no trader's own record reaches a visitor", async ({ page }) => {
  const bodies = await captureBodies(page, async () => {
    expect((await page.goto(`/p/${TOP}`))?.status()).toBe(200);
    await expect(page.getByText(/Their record is for members/)).toBeVisible();
    await page.goto("/top");
    await expect(page.getByRole("heading", { level: 1, name: "Leaderboard" })).toBeVisible();
  });
  for (const b of bodies) expect(b.body, b.url).not.toMatch(/Won 41 of 63|\+\$1\.2M|\$310K|Net P&L over time/);
});

test("/top: ranked by followable ROI on 30+ settled, each with its $100 line; holdings for members; past results", async ({ page, context }) => {
  // The tennis fixture: 32 settled shown at 45%, 20 won and 12 lost. $100 at 46% on each: +$1,148 on $3,200.
  await page.goto("/top?window=all");
  await expect(page.getByText(/Past results, not a promise\./).first()).toBeVisible();
  const tr = page.getByTestId("board-trackers").locator(".board__row").first();
  await expect(tr.getByRole("link", { name: "Tennis" })).toHaveAttribute("href", "/trackers/tennis");
  await expect(tr.locator(".board__fig b")).toHaveText("+35.9%");
  await expect(tr).toContainText("32 settled");
  await expect(tr).toContainText("$100 on every position since we started tracking: $3,200 in, +$1,148 back.");
  await expect(tr.getByRole("link", { name: "Members see what it holds now" })).toBeVisible();
  // Trackers under 30 settled (NFL has 3) aren't ranked.
  await expect(page.getByTestId("board-trackers").getByRole("link", { name: "NFL" })).toHaveCount(0);
  const td = page.getByTestId("board-traders").locator(".board__row").first();
  await expect(td.getByRole("link", { name: "E2E-Follow" })).toHaveAttribute("href", "/p/0xe2e00000000000000000000000000000000000dd");
  await expect(td.locator(".board__fig b")).toHaveText("+35.9%");
  await page.screenshot({ path: shotName("top-all", page), fullPage: true });
  // The last 30 days: only what settled in them (fewer than 30): nothing ranked.
  await page.goto("/top");
  await expect(page.getByText("No tracker has 30 settled positions in the last 30 days.")).toBeVisible();
  // Members see what each one holds now.
  await signIn(context, "pro");
  await page.goto("/top?window=all");
  await expect(page.getByTestId("board-trackers").locator(".board__row").first()).toContainText("Holds 3 open positions, $195K");
});

test("/open: open positions from winning trackers; a visitor sees the newest 30 minutes late and how many more, a member every one", async ({ page, context }) => {
  await page.goto("/open");
  const rows = page.getByTestId("open-now").locator("tbody tr");
  await expect(rows).toHaveCount(2); // the 5-minute-old one is a member's only
  await expect(rows.first()).toContainText("Tennis");
  await expect(rows.first()).toContainText("+35.9% followable · 32 settled");
  await expect(rows.first()).toContainText("$90K");
  await expect(rows.first()).toContainText("53%"); // seen at
  await expect(rows.first()).toContainText("58%"); // now
  await expect(page.getByTestId("open-more")).toContainText("1 more open.");
  await expect(page.getByText(/Past results, not a promise\./).first()).toBeVisible();
  await page.screenshot({ path: shotName("open", page), fullPage: true });
  await signIn(context, "pro");
  await page.goto("/open");
  await expect(page.getByTestId("open-now").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("open-more")).toHaveCount(0);
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
  await expect(rec.getByText("$1.6M")).toBeVisible(); // 1,401,811 this October + 240,000 in 2023
  await expect(rec.getByText("$450K")).toBeVisible();   // one sale
  await expect(page.getByText(/Every Form 4 they filed since Oct 27, 2016, open-market trades of stock only\./)).toBeVisible();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Oct 22, 2026");
  await expect(rows.first()).toContainText("$1.4M");
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
  await expect(rows.first()).toContainText("$1.4M");
  await expect(page.locator(".record").getByText("$1.4M")).toBeVisible();
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
  await page.locator("[data-move='13f:000099999826000002:037833100']").getByRole("link", { name: "E2E Fixture Capital", exact: true }).click();
  await expect(page).toHaveURL("/funds/999998-e2e-fixture-capital");
  await expect(page.getByText(/48 quarters on file with the SEC\./)).toBeVisible();
  const top = page.locator("section", { has: page.getByRole("heading", { name: "Top 10 holdings" }) });
  await expect(top.locator(".positions__row").first()).toContainText("E2E Fixture Devices");
  await expect(top.locator(".positions__row").first()).toContainText("$1.1B");
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
  await expect(feed.getByText("Jane Fixture, CEO of E2E Fixture Devices, bought $1.4M of EXDV.")).toBeVisible();
  await expect(feed.getByText("E2E Fixture Capital filed its 13F for the quarter ending Sep 30, 2026.", { exact: false })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("following-sec", page), fullPage: true });
  await q("delete from terminal.follows where user_id = 'user_e2e_insidir' and kind in ('insider', 'company', 'fund')");
});

test("robots.txt and the sitemaps by type: public pages, SEC pages, accounts and markets; never admin or account pages", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const r = await robots.text();
  expect(r).toContain("Sitemap: ");
  for (const d of ["/api/", "/admin", "/settings", "/following", "/start"]) expect(r).toContain(`Disallow: ${d}`);
  expect(r).not.toContain("Disallow: /p/");
  const idx = await (await request.get("/sitemap.xml")).text();
  for (const t of ["pages", "trackers", "companies", "insiders", "funds", "traders", "markets"]) expect(idx).toContain(`/sitemaps/${t}.xml</loc>`);
  const get = async (t: string) => { const res = await request.get(`/sitemaps/${t}.xml`); expect(res.status(), t).toBe(200); return res.text(); };
  expect(await get("insiders")).toContain("/insiders/888888-jane-fixture");
  expect(await get("companies")).toContain("/insider-trading/EXDV");
  expect(await get("funds")).toContain("/funds/999998-e2e-fixture-capital");
  expect(await get("pages")).toContain("/pricing</loc>");
  expect(await get("traders")).toContain("/p/0xe2e");
  expect(await get("trackers")).toContain("/trackers/biggest-bets</loc>");
  for (const t of ["pages", "trackers"]) for (const p of ["/following", "/settings", "/admin"]) expect(await get(t)).not.toContain(`${p}</loc>`);
});


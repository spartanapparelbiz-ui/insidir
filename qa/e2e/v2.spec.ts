/* docs/INSIDIR-V2.md: the landing, the feed and its plan gating, location rules, Coming soon, following, results. Runs at
 * 390×844 and 1440×900 against the seeded fixtures (qa/e2e/seed.ts: E2E-Top has a 41-of-63 record). */
import { expect, test } from "@playwright/test";
import { captureBodies, q, signIn } from "./helpers";

test("landing: hero with one black button, three laptops and Crypto · Soon, Open now, the leaderboard, how it works, the proof strip, all stamped", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1, name: "Follow the big money." });
  await expect(h1).toBeVisible();
  await expect(page.getByText("Insidir analyzes every large position on Polymarket, Kalshi and SEC filings: who placed it, their verified record, and what it means. Within minutes.")).toBeVisible();
  const cta = page.locator('[data-cta="hero"]');
  await expect(cta).toHaveText("Start your 7-day trial");
  await expect(page.getByRole("link", { name: /^Explore trackers/ })).toHaveAttribute("href", "/trackers");
  await expect(page.getByText("$1 for the first week, then $39 a month. Cancel anytime. Secure sign-in and payments by Whop.").first()).toBeVisible();
  // One black button (plus the nav's Get started): no offer bar, no sticky bar.
  await expect(page.getByTestId("sticky-cta")).toHaveCount(0);
  await expect(page.locator(".trialbar")).toHaveCount(0);
  const primaries = await page.locator("main .btn--primary").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null && !e.closest("[inert]")).length);
  expect(primaries).toBe(1);
  // No pills, no 700 weights.
  await expect(page.locator(".rpill")).toHaveCount(0);
  expect(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => Number(getComputedStyle(e).fontWeight) > 600).length)).toBe(0);
  const vh = page.viewportSize()!.height;
  for (const el of [h1, cta]) expect((await el.boundingBox())!.y + 10).toBeLessThan(vh);
  // Three laptops; crypto is one line.
  await expect(page.locator(".lt__item .lt__name")).toHaveText(["Sports", "Prediction markets", "Stocks"]);
  await expect(page.locator(".lt__soon summary")).toContainText("Crypto · Soon");
  for (const h of ["Open now from winning trackers", "Leaderboard", "How Insidir works", "Insidir, live"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  // Open now: the newest from winning trackers (the tennis fixture), how many more, and past results beside it.
  await expect(page.getByTestId("open-now").locator("tbody tr").first()).toContainText("Tennis");
  await expect(page.getByTestId("open-more")).toContainText("1 more open.");
  await expect(page.getByText(/Past results, not a promise\./).first()).toBeVisible();
  // The leaderboard: Tennis is the one tracker with 30+ settled.
  await expect(page.getByTestId("home-board").locator(".board__name").first()).toHaveText("Tennis");
  await expect(page.locator(".board__row")).toHaveCount(1);
  await expect(page.locator(".steps__item")).toHaveCount(3);
  for (const id of ["proof-volume", "proof-week", "proof-accounts", "proof-check"]) await expect(page.getByTestId(id)).toBeVisible();
  // Every figure says when it was read, in Eastern Time, and that visitors see it 30 minutes late.
  expect(await page.locator("main [data-asof]").count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".asof").first()).toContainText(/As of \d{1,2}:\d{2}\s?(AM|PM) ET/);
  await expect(page.locator(".asof").first()).toContainText("30-min delay");
  // No page sideways scroll at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("home hero: Start your 7-day trial is recorded and opens /start; Explore trackers lists every tracker with its record or the record being built", async ({ page }) => {
  const count = async (name: string) => (await q<{ n: number }>("select count(*)::int as n from terminal.events where name = $1", [name]))[0]!.n;
  const before = await count("hero_cta_click");
  await page.goto("/");
  await page.locator('[data-cta="hero"]').click();
  await expect(page).toHaveURL(/\/start(\?|$)/);
  await expect.poll(() => count("hero_cta_click")).toBe(before + 1);
  await page.goto("/");
  await page.getByRole("link", { name: /^Explore trackers/ }).click();
  await expect(page).toHaveURL(/\/trackers$/);
  await page.goto("/trackers");
  await expect(page.getByRole("heading", { level: 1, name: "Trackers" })).toBeVisible();
  // Every tracker but Crypto Prices (its tab isn't live), in four groups.
  await expect(page.locator(".ttile")).toHaveCount(32);
  for (const g of ["Styles", "Leagues", "Topics", "Stocks"]) await expect(page.getByRole("heading", { level: 2, name: g })).toBeVisible();
  // Every tracker but Tennis has fewer than 30 settled: "Building record · N of 30", never New, never a made-up record.
  for (const r of await page.locator(".ttile .res").allInnerTexts()) expect(r).toMatch(/^(Building record · \d+ of 30|[\s\S]*Won \d+%)$/);
  await expect(page.locator(".ttile", { hasText: "Tennis" }).locator(".res")).toContainText("Won 63%");
  await expect(page.locator(".ttile .res", { hasText: /^New$/ })).toHaveCount(0);
  // Each cover: 4:3, deep colour.
  const box = (await page.locator(".ttile .tcover").first().boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(4 / 3, 1);
  await page.locator(`.ttile a[href="/trackers/biggest-bets"]`).click();
  await expect(page).toHaveURL(/\/trackers\/biggest-bets$/);
  await expect(page.getByRole("heading", { level: 1, name: "Whales ($100K+)" })).toBeVisible();
  // Fewer than 20 settled moves: every rate says so instead of a number.
  await expect(page.getByText(/Not enough data yet: the chart starts at 20 settled positions/)).toBeVisible();
  await expect(page.locator(".tile").filter({ has: page.locator("dt", { hasText: /^Win rate$/ }) })).toContainText("Not enough data yet");
  await expect(page.getByRole("button", { name: /Follow/ }).first()).toBeVisible();
});

test("one font: headlines, body text, buttons and cards are all Schibsted Grotesk, and it loads", async ({ page }) => {
  await page.goto("/trackers/biggest-bets");
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const first = (v: string) => v.split(",")[0]!.trim().replace(/["']/g, "");
    const font = (s: string) => first(getComputedStyle(document.querySelector(s)!).fontFamily);
    return { sans: first(root.getPropertyValue("--font-schibsted")), rufina: root.getPropertyValue("--font-rufina").trim(),
      h1: font("h1"), h2: font("h2"), body: font("body"), btn: font(".btn"),
      loaded: [...document.fonts].filter(f => f.status === "loaded").map(f => f.family) };
  });
  expect(r.sans).not.toBe("");
  expect(r.rufina).toBe("");
  expect([r.h1, r.h2, r.body, r.btn]).toEqual([r.sans, r.sans, r.sans, r.sans]);
  expect(r.loaded.map(x => x.replace(/["']/g, ""))).toContain(r.sans.replace(/["']/g, ""));
});

test("the public preview: home and the product pages show real moves 30 minutes late, records blurred, never sent", async ({ page }) => {
  const bodies = await captureBodies(page, async () => { await page.goto("/"); await page.goto("/sports"); await page.goto("/markets"); });
  await expect(page.locator(".move").first()).toBeVisible();
  const locked = page.getByTestId("locked-record").first();
  await expect(locked).toBeVisible();
  await expect(locked).toContainText("Win rate · All-time net P&L");
  await expect(locked).toContainText("members only");
  expect(await locked.innerText()).not.toMatch(/\d|NaN/);
  for (const b of bodies) expect(b.body, b.url).not.toMatch(/Won 41 of 63|Won 00 of 00|NaN%/);
});

test("member feed: live moves with the record line; following a trader shows on Following", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/feed");
  await expect(page.locator(".move__head", { hasText: "Chiefs to beat the Bills" }).first()).toBeVisible();
  await expect(page.getByText("Won 41 of 63 · Net P&L +$1.2M").first()).toBeVisible();
  await expect(page.locator(".move__live").first()).toContainText(/^Entry \d+%/);
  await expect(page.getByText(/Live · updated \d+s ago/)).toBeVisible();
  await q("delete from terminal.follows");
  await page.locator(".move").first().getByRole("button", { name: "Follow" }).click();
  await expect(page.locator(".move").first().getByRole("button", { name: "Following" })).toBeVisible();
  await page.goto("/following");
  await expect(page.locator(".flist").getByRole("link", { name: "E2E-Top" })).toBeVisible();
  // Their recent moves are in the Following feed too.
  await expect(page.getByTestId("following-feed").locator(".move__head", { hasText: "Chiefs to beat the Bills" }).first()).toBeVisible();
  await q("delete from terminal.follows");
});

test("a US member never gets an international Polymarket link, and Coming soon saves an email", async ({ page, context }) => {
  await signIn(context, "insidir");
  for (const path of ["/", "/feed", "/market/0xe2emarket1", "/trader/0xe2e00000000000000000000000000000000000aa", "/p/0xe2e00000000000000000000000000000000000aa", "/top", "/results"]) {
    await page.goto(path);
    const hrefs = await page.locator("a[href]").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
    for (const h of hrefs) expect(h, `${path}: ${h}`).not.toMatch(/^https?:\/\/(www\.)?polymarket\.com/);
  }
  await q("delete from terminal.waitlist");
  await page.goto("/feed");
  await page.getByRole("button", { name: /Crypto/ }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Coming soon." })).toBeVisible();
  await sheet.getByRole("textbox").fill("waitlist@example.test");
  await sheet.getByRole("button", { name: "Tell me when it's live" }).click();
  await expect(sheet.getByText("Thanks. You're on the list.")).toBeVisible();
  expect(await q("select feature from terminal.waitlist where email = 'waitlist@example.test'")).toEqual([{ feature: "crypto" }]);
});

test("outside the US, the market page links to the source market", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/market/0xe2emarket1");
  await expect(page.getByRole("link", { name: "See it on Polymarket" })).toHaveAttribute("href", /polymarket\.com/);
});

test("location is asked once, as a sheet, the first time a market link is tapped", async ({ page, context }) => {
  await q("update terminal.users set region = null where id = 'user_e2e_pro'");
  try {
  await signIn(context, "pro");
  await page.goto("/market/0xe2emarket1");
  await page.getByRole("button", { name: "See market" }).click();
  const sheet = page.getByRole("dialog", { name: "Where are you?" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Outside US" }).click();
  await expect(page.getByRole("link", { name: "See it on Polymarket" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Location: Outside US/ })).toHaveCount(0); // the pill lives on the feed
  await page.goto("/feed");
  await expect(page.getByRole("button", { name: /Location: Outside US/ })).toBeVisible();
  } finally {
    await q("update terminal.users set region = 'us' where id = 'user_e2e_pro'");
  }
});

test("results are public: totals, refunds labelled, pages instead of a cap; /pricing's live week numbers", async ({ page }) => {
  await page.goto("/results");
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.locator(".rlist__res--won").first()).toBeVisible();
  const total = page.getByTestId("results-total");
  await expect(total).toContainText(/won, \d+ lost/);
  await expect(total).toContainText("Average entry:");
  // Polymarket wallets only, checked against their own trades: 1 won, 1 lost, 1 sold before the result; net
  // +$180K − $64K + $10K = +$126K, explained in one line.
  await expect(total).toContainText("1 won, 1 lost, 1 closed before settlement");
  await expect(page.getByTestId("record-net")).toContainText("Net for these traders: +$126K");
  await expect(total).toContainText("What these positions realized");
  await expect(page.locator(".rlist__res--sold").first()).toHaveText("Closed before settlement");
  // /pricing's "This week on Insidir": live numbers only, the last accuracy check among them.
  await page.goto("/pricing");
  await expect(page.getByTestId("week-positions")).toContainText(/\d/);
  await expect(page.getByTestId("week-check")).toContainText(/\d+ of \d+/);
  await expect(page.getByTestId("week-check")).toContainText("matched");
  await page.goto("/results?page=99");
  expect((await page.goto("/results?page=99"))?.status()).toBeLessThan(400);
});

test("results show wins and losses; /terminal goes to the feed", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/results");
  await expect(page.getByText("Real past positions. Not a promise.")).toBeVisible();
  await expect(page.locator(".rlist__res--won").first()).toBeVisible();
  await expect(page.locator(".rlist__res--lost").first()).toBeVisible();
  await page.goto("/terminal");
  await expect(page).toHaveURL(/\/feed$/);
});

test("share card: a 1080×1920 PNG, never early for free viewers", async ({ page, context }) => {
  const late = await page.request.get("/api/share/e2e%3Am4");
  expect(late.status()).toBe(200);
  expect(late.headers()["content-type"]).toBe("image/png");
  const png = await late.body();
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  expect((await page.request.get("/api/share/e2e%3Am1")).status()).toBe(404); // 4 minutes old: paid data
  await signIn(context, "insidir");
  expect((await page.request.get("/api/share/e2e%3Am1")).status()).toBe(200);
});

test("/admin/posts: only the allowlisted email; top moves with Download and a caption", async ({ page, context }) => {
  expect((await page.goto("/admin/posts"))?.status()).toBe(404);
  await signIn(context, "insidir");
  expect((await page.goto("/admin/posts"))?.status()).toBe(404);
  await context.clearCookies();
  await signIn(context, "pro");
  await page.goto("/admin/posts");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  const first = page.locator("[data-post]").first();
  await expect(first.getByRole("link", { name: "Download" })).toHaveAttribute("href", /^\/api\/share\//);
  await expect(first.getByLabel("Caption")).toHaveValue(/^E2E-Top · Top-ranked trader: \$412K position on Chiefs to win\./);
  await expect(first.getByLabel("Caption")).toHaveValue(/Not financial advice\./);
});

test("Stocks: insider buys and fund adds in plain words, each linking to its SEC filing", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/feed?tab=stocks");
  await expect(page.getByRole("button", { name: "Stocks", pressed: true })).toBeVisible();
  const insider = page.locator("[data-move='f4:000099999926000001']");
  await expect(insider.locator(".move__head")).toHaveText("E2E Fixture Devices stock, bought by its CEO");
  // The amount is said once, under the headline; the right side says what it is: a purchase.
  await expect(insider.locator(".move__meta")).toContainText("$1.4M");
  await expect(insider.locator(".res__st")).toHaveText("Purchase");
  // Never "just bought": the filing day, then the trade date; the note carries both dates (in Details).
  await insider.locator(".move__more summary").click();
  await expect(insider.getByText(/^Form 4 · Filed [A-Z][a-z]{2} \d{1,2} · CEO Jane Fixture purchased \$1\.4M of EXDV on Oct 22\.$/)).toBeVisible();
  await expect(insider.getByText(/^Traded Oct 22 at \$182\.65 a share\. Filed with the SEC [A-Z][a-z]{2} \d{1,2}\.$/)).toBeVisible();
  await expect(insider.getByRole("link", { name: /Where this comes from: SEC EDGAR filing/ })).toHaveAttribute("href", /^https:\/\/www\.sec\.gov\//);
  await expect(insider.locator(".move__kind")).toHaveText("Stocks · EXDV");
  const link = insider.getByRole("link", { name: "See the SEC filing" });
  await expect(link).toHaveAttribute("href", "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/0000999999-26-000001-index.htm");
  await expect(link).toHaveAttribute("target", "_blank");
  const fund = page.locator("[data-move='13f:000099999826000002:037833100']");
  await fund.locator(".move__more summary").click();
  await expect(fund.getByText(/^13F · Q3 \d{4} · E2E Fixture Capital added \$250M of E2E Fixture Devices\.$/)).toBeVisible();
  await expect(fund.getByText(/^Q3 \d{4} holdings · filed Oct 21\. 13F data can be up to 45 days old\.$/)).toBeVisible();
  // Stock cards never offer Follow or a market page, and Crypto is still Coming soon.
  await expect(page.locator("[data-move^='f4:'] .follow--locked, [data-move^='13f:'] a[href^='/market/']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Crypto/ })).toContainText("Soon");
  await expect(page.getByRole("button", { name: /Crypto/ })).not.toContainText("Coming soon");
  // Stocks never mixes into the Sports tab.
  const sports = await (await page.request.get("/api/moves?tab=sports&min=10000")).json() as { items: Array<{ tab: string }> };
  expect(sports.items.every(i => i.tab === "sports")).toBe(true);
});

test("home: no zero trader box or 0 won · 0 lost; the pricing page's one plan card, and /start's three lines", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/Big moves 0 |Total in \$0|\b0 won · 0 lost/);
  await page.goto("/pricing");
  // One plan card: $39/month, the $1 week, Start for $1, five checkmarks; no "More coming" line.
  const card = page.getByTestId("plan-card");
  await expect(card).toContainText("$39/month");
  await expect(card).toContainText("Your first week is $1. Cancel anytime.");
  await expect(card.getByRole("link", { name: "Start for $1" })).toBeVisible();
  await expect(card.locator("li")).toHaveCount(5);
  await expect(page.locator("main")).not.toContainText("More coming");
  // /start keeps it to three lines (qa/e2e/funnel.spec.ts checks them).
  await page.goto("/start");
  await expect(page.getByTestId("start-list").locator("li")).toHaveCount(3);
});

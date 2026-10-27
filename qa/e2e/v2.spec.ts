/* docs/INSIDIR-V2.md: the landing, the feed and its plan gating, location rules, Coming soon, following, results. Runs at
 * 390×844 and 1440×900 against the seeded fixtures (qa/e2e/seed.ts: E2E-Top has a 41-of-63 record). */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

test("landing: the brief's hero, and on a phone the headline, button and top of the first card show without scrolling", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1, name: "Follow the big money." });
  await expect(h1).toBeVisible();
  const cta = page.getByRole("link", { name: "See the live feed" }).first();
  await expect(cta).toHaveAttribute("href", "/feed");
  await expect(page.getByText("$1 for 3 days, then $39/mo. Cancel anytime.").first()).toBeVisible();
  // One real move per photo on a solid card (components/home/Hero.tsx).
  const card = page.locator(".cine__card .hcard");
  await expect(page.getByText("LIVE · big money moves")).toBeVisible();
  await expect(card).toBeVisible();
  const vh = page.viewportSize()!.height;
  for (const el of [h1, cta]) expect((await el.boundingBox())!.y + 10).toBeLessThan(vh);
  expect((await card.boundingBox())!.y + 24).toBeLessThan(vh);
  // Home cards show only the time ago, never "30 min late" (the feed says it once, in its upsell).
  await expect(page.locator("main").getByText(/30 min late/)).toHaveCount(0);
  // What it is, in plain words, for a first-time visitor.
  await expect(page.getByText("Live tracker for sports bets, prediction markets and insider stock trades", { exact: true })).toBeVisible();
});

test("home hero: the button, a ticker tap and the feed preview scrolled into view are each recorded", async ({ page }) => {
  const count = async (name: string) => (await q<{ n: number }>("select count(*)::int as n from terminal.events where name = $1", [name]))[0]!.n;
  const before = { cta: await count("hero_cta_click"), ticker: await count("ticker_click"), preview: await count("feed_preview_view") };
  await page.goto("/");
  await page.locator("#preview").scrollIntoViewIfNeeded();
  await expect.poll(() => count("feed_preview_view")).toBe(before.preview + 1);
  await page.goto("/");
  // White on the black strip (the global running-text link colour must not win here).
  expect(await page.locator(".ticker__list:not([aria-hidden]) .ticker__item").first().evaluate(e => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
  await page.locator(".ticker__list:not([aria-hidden]) .ticker__item").first().click({ force: true }); // it scrolls, so never "stable"
  await expect.poll(() => count("ticker_click")).toBe(before.ticker + 1);
  await page.goto("/");
  await page.locator(".cine__cta a").click();
  await expect(page).toHaveURL(/\/feed/);
  await expect.poll(() => count("hero_cta_click")).toBe(before.cta + 1);
});

test("headlines are in the serif (Rufina); body text, buttons and cards in Schibsted Grotesk; both load", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const first = (v: string) => v.split(",")[0]!.trim().replace(/["']/g, "");
    const font = (s: string) => first(getComputedStyle(document.querySelector(s)!).fontFamily);
    return { sans: first(root.getPropertyValue("--font-schibsted")), serif: first(root.getPropertyValue("--font-rufina")),
      h1: font("h1"), h2: font("h2"), body: font("body"), btn: font(".btn"), card: font(".move__sentence"),
      loaded: [...document.fonts].filter(f => f.status === "loaded").map(f => f.family) };
  });
  expect(r.sans).not.toBe("");
  expect(r.serif).not.toBe("");
  expect([r.h1, r.h2]).toEqual([r.serif, r.serif]);
  expect([r.body, r.btn, r.card]).toEqual([r.sans, r.sans, r.sans]);
  for (const f of [r.sans, r.serif]) expect(r.loaded.map(x => x.replace(/["']/g, ""))).toContain(f.replace(/["']/g, ""));
});

test("free feed: moves 30 minutes late, no records anywhere in the response, follow locked, one upsell", async ({ page }) => {
  const res = page.waitForResponse(r => r.url().includes("/api/moves"));
  await page.goto("/feed");
  await expect(page.getByText("You're seeing moves 30 minutes late. See them live for $1.")).toBeVisible();
  await page.getByRole("button", { name: "$50k+" }).click();
  const body = await (await res).json() as { items: Array<{ at: number; record: string | null; topTrader: boolean; sentence: string }> };
  for (const m of body.items) {
    expect(m.record).toBeNull();
    expect(m.topTrader).toBe(false);
    expect(Date.now() - m.at).toBeGreaterThan(29 * 60_000);
    expect(m.sentence).not.toMatch(/top trader/i);
  }
  await expect(page.locator(".move__record")).toHaveCount(0);
  await expect(page.locator(".follow--locked").first()).toBeVisible();
});

test("member feed: live moves with the record line; following a trader shows on Following", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/feed");
  await expect(page.getByText("E2E-Top, a top trader, just put $412,000 on Chiefs to win.").first()).toBeVisible();
  await expect(page.getByText("Won 41 of 63 · +$1.2M all-time").first()).toBeVisible();
  await expect(page.getByText(/Live · updated \d+s ago/)).toBeVisible();
  await q("delete from terminal.follows");
  await page.locator(".move").first().getByRole("button", { name: "Follow" }).click();
  await expect(page.locator(".move").first().getByRole("button", { name: "Following" })).toBeVisible();
  await page.goto("/following");
  await expect(page.getByRole("link", { name: "E2E-Top" })).toBeVisible();
  await q("delete from terminal.follows");
});

test("a US visitor never gets an international Polymarket link, and Coming soon saves an email", async ({ page, context }) => {
  await context.addCookies([{ name: "insidir_region", value: "us", url: "http://localhost:3100" }]);
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
  await expect(sheet.getByText("Thanks. We'll email you when it's live.")).toBeVisible();
  expect(await q("select feature from terminal.waitlist where email = 'waitlist@example.test'")).toEqual([{ feature: "crypto" }]);
});

test("outside the US, the market page links to the source market", async ({ page, context }) => {
  await context.addCookies([{ name: "insidir_region", value: "non_us", url: "http://localhost:3100" }]);
  await page.goto("/market/0xe2emarket1");
  await expect(page.getByRole("link", { name: "See it on Polymarket" })).toHaveAttribute("href", /polymarket\.com/);
});

test("location is asked once, as a sheet, the first time a market link is tapped", async ({ page }) => {
  await page.goto("/market/0xe2emarket1");
  await page.getByRole("button", { name: "See market" }).click();
  const sheet = page.getByRole("dialog", { name: "Where are you?" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Outside US" }).click();
  await expect(page.getByRole("link", { name: "See it on Polymarket" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Location: Outside US/ })).toHaveCount(0); // the pill lives on the feed
  await page.goto("/feed");
  await expect(page.getByRole("button", { name: /Location: Outside US/ })).toBeVisible();
});

test("results show wins and losses; /terminal goes to the feed", async ({ page }) => {
  await page.goto("/results");
  await expect(page.getByText("Real past moves. Not a promise.")).toBeVisible();
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
  await expect(first.getByLabel("Caption")).toHaveValue(/^E2E-Top, a top trader, put \$412,000 on Chiefs to win\./);
  await expect(first.getByLabel("Caption")).toHaveValue(/Not financial advice\./);
});

test("Stocks: insider buys and fund adds in plain words, each linking to its SEC filing", async ({ page }) => {
  await page.goto("/feed?tab=stocks");
  await expect(page.getByRole("button", { name: "Stocks", pressed: true })).toBeVisible();
  const insider = page.locator("[data-move='f4:000099999926000001']");
  // Never "just bought": the filing day, then the trade date; the note carries both dates.
  await expect(insider.getByText(/^Filed (today|[A-Z][a-z]{2} \d{1,2}): Jane Fixture, CEO of E2E Fixture Devices, bought \$1\.4M of E2E Fixture Devices stock on Oct 22\.$/)).toBeVisible();
  await expect(insider.getByText(/^Traded Oct 22 at \$182\.65 a share\. Filed with the SEC [A-Z][a-z]{2} \d{1,2}\.$/)).toBeVisible();
  await expect(insider.getByRole("link", { name: /Where this comes from: SEC EDGAR filing/ })).toHaveAttribute("href", /^https:\/\/www\.sec\.gov\//);
  await expect(insider.locator(".tag")).toHaveText("Stocks · EXDV");
  const link = insider.getByRole("link", { name: "See the SEC filing" });
  await expect(link).toHaveAttribute("href", "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/0000999999-26-000001-index.htm");
  await expect(link).toHaveAttribute("target", "_blank");
  const fund = page.locator("[data-move='13f:000099999826000002:037833100']");
  await expect(fund.getByText(/^E2E Fixture Capital added \$250M of E2E Fixture Devices in Q3 \d{4}\.$/)).toBeVisible();
  await expect(fund.getByText(/^Q3 \d{4} holdings · filed Oct 21\. 13F data can be up to 45 days old\.$/)).toBeVisible();
  // Stock cards never offer Follow or a market page, and Crypto is still Coming soon.
  await expect(page.locator("[data-move^='f4:'] .follow--locked, [data-move^='13f:'] a[href^='/market/']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Crypto/ })).toContainText("Coming soon");
  // Stocks never mixes into the Sports tab.
  const sports = await (await page.request.get("/api/moves?tab=sports&min=10000")).json() as { items: Array<{ tab: string }> };
  expect(sports.items.every(i => i.tab === "sports")).toBe(true);
});

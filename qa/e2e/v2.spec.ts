/* docs/V2.md: the landing, the feed and its plan gating, location rules, Coming soon, following, results. Runs at
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
  const card = page.locator(".stack__card--0 .move");
  await expect(card).toBeVisible();
  const vh = page.viewportSize()!.height;
  for (const el of [h1, cta]) expect((await el.boundingBox())!.y + 10).toBeLessThan(vh);
  expect((await card.boundingBox())!.y + 24).toBeLessThan(vh);
});

test("Plus Jakarta Sans is the computed font on headings, body text and buttons", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ["h1", "body", ".btn--primary", ".move__sentence"].map(s => getComputedStyle(document.querySelector(s)!).fontFamily));
  for (const f of fonts) expect(f).toMatch(/Plus Jakarta Sans/i);
  const loaded = await page.evaluate(() => [...document.fonts].some(f => /Plus Jakarta Sans/i.test(f.family) && f.status === "loaded"));
  expect(loaded).toBe(true);
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
  await expect(page.getByText("A top trader just put $412,000 on Chiefs to win.").first()).toBeVisible();
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
  for (const path of ["/", "/feed", "/market/0xe2emarket1", "/trader/0xe2e00000000000000000000000000000000000aa", "/results"]) {
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
  await expect(first.getByLabel("Caption")).toHaveValue(/^A top trader put \$412,000 on Chiefs to win\./);
  await expect(first.getByLabel("Caption")).toHaveValue(/Not financial advice\./);
});

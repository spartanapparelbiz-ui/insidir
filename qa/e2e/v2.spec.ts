/* docs/INSIDIR-V2.md: the landing, the feed and its plan gating, location rules, Coming soon, following, results. Runs at
 * 390×844 and 1440×900 against the seeded fixtures (qa/e2e/seed.ts: E2E-Top has a 41-of-63 record). */
import { expect, test } from "@playwright/test";
import { captureBodies, q, signIn } from "./helpers";

test("landing: the brief's hero, and on a phone the headline, button and top of the first card show without scrolling", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1, name: "Follow the big money." });
  await expect(h1).toBeVisible();
  const cta = page.locator('[data-cta="hero"]');
  await expect(cta).toHaveText("Try 7 days for $1");
  await expect(cta).toHaveAttribute("href", "/start");
  await expect(page.getByText("Then $39/mo, cancel anytime.").first()).toBeVisible();
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
  await expect(page).toHaveURL(/\/start/);
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

test("the public preview: home and the product pages show real moves 30 minutes late, records blurred, never sent", async ({ page }) => {
  const bodies = await captureBodies(page, async () => { await page.goto("/"); await page.goto("/sports"); await page.goto("/markets"); });
  await expect(page.locator(".move").first()).toBeVisible();
  const locked = page.getByTestId("locked-record").first();
  await expect(locked).toBeVisible();
  await expect(locked).toContainText("Win rate · All-time profit");
  await expect(locked).toContainText("members only");
  expect(await locked.innerText()).not.toMatch(/\d|NaN/);
  for (const b of bodies) expect(b.body, b.url).not.toMatch(/Won 41 of 63|Won 00 of 00|NaN%/);
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

test("sign-up pop-up: after 60% scroll or exit intent, once per visit, closes on ×, Esc and outside; never for members", async ({ page, context }) => {
  const popup = page.getByRole("dialog", { name: "See the biggest bets the moment they happen." });
  await page.goto("/");
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.3));
  await page.waitForTimeout(300);
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.65));
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Then $39/mo, cancel anytime.");
  await expect(popup.getByRole("link", { name: "Try 7 days for $1" })).toHaveAttribute("href", "/start");
  await expect(popup.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(popup.locator("img")).toHaveCount(1);
  await expect(popup.locator("svg").first()).toBeVisible();
  // Focus starts on Get Insidir and Tab never leaves the pop-up.
  await expect(popup.getByRole("link", { name: "Try 7 days for $1" })).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await popup.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: `qa/screenshots/signup-popup-${page.viewportSize()!.width}.png` });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  // Once per visit: no other public page shows it again.
  await page.goto("/sports");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await expect(popup).toHaveCount(0);

  // A new visit: × closes it, and a tap outside the card closes it.
  for (const close of ["x", "outside"] as const) {
    const p2 = await context.newPage();
    await p2.goto("/results");
    await p2.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const d = p2.getByRole("dialog", { name: "See the biggest bets the moment they happen." });
    if (await p2.evaluate(() => document.documentElement.scrollHeight - innerHeight <= 0)) await p2.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: -1, bubbles: true })));
    await expect(d).toBeVisible();
    if (close === "x") await d.getByRole("button", { name: "Close" }).click();
    else await p2.mouse.click(5, 5);
    await expect(d).toHaveCount(0);
    await p2.close();
  }

  // Never on /start or /login, whatever the scroll.
  for (const path of ["/start", "/login"]) {
    const p3 = await context.newPage();
    await p3.goto(path);
    await p3.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await p3.waitForTimeout(400);
    await expect(p3.getByTestId("signup-popup")).toHaveCount(0);
    await p3.close();
  }

  // Members never see it.
  await signIn(context, "insidir");
  const fresh = await context.newPage();
  await fresh.goto("/");
  await fresh.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await fresh.waitForTimeout(400);
  await expect(fresh.getByTestId("signup-popup")).toHaveCount(0);
});

test("sign-up pop-up: exit intent on a desktop opens it before any scrolling", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 900, "desktop only");
  await page.goto("/sports");
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: -1, bubbles: true })));
  await expect(page.getByTestId("signup-popup")).toBeVisible();
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

test("results are public: totals match the home trust block, refunds labelled, pages instead of a cap", async ({ page }) => {
  await page.goto("/results");
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.locator(".rlist__res--won").first()).toBeVisible();
  const total = page.getByTestId("results-total");
  await expect(total).toContainText(/won, \d+ lost/);
  await expect(total).toContainText("Average odds when they bet:");
  // Polymarket wallets only, checked against their own trades: 1 won, 1 lost, 1 sold before the result; net
  // +$180K − $64K + $10K = +$126K, explained in one line.
  await expect(total).toContainText("1 won, 1 lost, 1 sold before the result");
  await expect(page.getByTestId("record-net")).toContainText("Net for these traders: +$126K");
  await expect(total).toContainText("What these bets really made");
  await expect(page.locator(".rlist__res--sold").first()).toHaveText("Sold early");
  const totalText = await total.innerText();
  await page.goto("/");
  const home = await page.getByTestId("trust-record").innerText();
  for (const line of totalText.split("\n").filter(l => /Average odds|won, \d+ lost/.test(l))) expect(home).toContain(line.trim());
  expect(home).not.toContain("Net for");
  const check = page.getByTestId("trust-check");
  await expect(check).toContainText(/matched/);
  await expect(check.getByRole("link", { name: "How we check" })).toHaveAttribute("href", "/data");
  await page.goto("/results?page=99");
  expect((await page.goto("/results?page=99"))?.status()).toBeLessThan(400);
});

test("results show wins and losses; /terminal goes to the feed", async ({ page, context }) => {
  await signIn(context, "insidir");
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

test("Stocks: insider buys and fund adds in plain words, each linking to its SEC filing", async ({ page, context }) => {
  await signIn(context, "insidir");
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
  await expect(page.getByRole("button", { name: /Crypto/ })).toContainText("Soon");
  await expect(page.getByRole("button", { name: /Crypto/ })).not.toContainText("Coming soon");
  // Stocks never mixes into the Sports tab.
  const sports = await (await page.request.get("/api/moves?tab=sports&min=10000")).json() as { items: Array<{ tab: string }> };
  expect(sports.items.every(i => i.tab === "sports")).toBe(true);
});

test("home: no zero trader box or 0 won · 0 lost, and the plan card lists what /start lists", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/Big moves 0 |Total in \$0|\b0 won · 0 lost/);
  const plan = page.locator(".plan2 .start__list li");
  const n = await plan.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(5);
  await expect(page.locator(".plan2 .start__more")).toHaveText(/^More coming: /);
  await page.goto("/start");
  const start = await page.getByTestId("start-list").locator("li").allInnerTexts();
  await page.goto("/");
  expect(await plan.allInnerTexts()).toEqual(start);
});

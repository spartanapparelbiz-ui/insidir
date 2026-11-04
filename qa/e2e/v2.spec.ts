/* docs/INSIDIR-V2.md: the landing, the feed and its plan gating, location rules, Coming soon, following, results. Runs at
 * 390×844 and 1440×900 against the seeded fixtures (qa/e2e/seed.ts: E2E-Top has a 41-of-63 record). */
import { expect, test } from "@playwright/test";
import { captureBodies, q, signIn } from "./helpers";

test("landing: final on first paint, the hero's words and its CTAs, the nav, no stocks, no pop-up on arrival, no visitor bar", async ({ page }) => {
  const html = await (await page.request.get("/")).text();
  expect(html).toContain("You&#x27;re betting");
  expect(html).toContain("against millionaires.");
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText(/You're betting\s*against millionaires\./);
  await expect(page.getByTestId("hero-line")).toContainText("Wallets up $1M+ bet");
  // The nav: Markets, Board, Record, Pricing, FAQ; Log in; Start for $1 → /go.
  const links = (await page.locator(".b-nav-links a").allInnerTexts()).map(t => t.trim());
  // Election Day leads the nav on Nov 3–4 ET (lib/brand/pulse.ts electionDay), then drops out.
  if (page.viewportSize()!.width > 1160) expect(links.filter((t, i) => !(i === 0 && t === "Election Day"))).toEqual(["Markets", "Board", "Record", "Pricing", "FAQ"]);
  await expect(page.getByTestId("nav-start")).toHaveAttribute("href", "/go");
  for (const href of await page.locator("[data-checkout]").evaluateAll(els => els.map(e => e.getAttribute("href")))) expect(href).toMatch(/^\/go/);
  // The pitch (the footer's "isn't affiliated with … the SEC" aside).
  const text = await page.evaluate(() => { const m = document.querySelector("main")!.cloneNode(true) as HTMLElement; m.querySelectorAll("footer").forEach(f => f.remove()); return m.innerText; });
  expect(text).not.toMatch(/\b(stocks?|crypto|SEC|CEO|insider stock|Congress)\b/i);
  expect(text).not.toMatch(/guaranteed|risk-free/i);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("late-bar")).toHaveCount(0);
  // Weights above 600: only the wordmark (the hero spec's 800).
  expect(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => Number(getComputedStyle(e).fontWeight) > 600 && !e.closest(".b-logo")).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("?ref= is kept for attribution only: the same home page, the ref and UTM cookies set; the retired stock pages are 301s", async ({ page, context }) => {
  await page.goto("/?ref=insidirfinance");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/You're betting\s*against millionaires\./);
  const cookies = await context.cookies();
  expect(cookies.find(c => c.name === "insidir_ref")?.value).toBe("insidirfinance");
  expect(JSON.parse(decodeURIComponent(cookies.find(c => c.name === "insidir_utm")!.value))).toMatchObject({ utm_source: "insidirfinance", utm_medium: "ref" });
  for (const path of ["/stocks", "/insider-trading/EXDV", "/NVDA"]) {
    const r = await page.request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(301);
    expect(r.headers().location, path).toMatch(/\/board$/);
  }
  expect(await (await page.request.get("/sitemaps/pages.xml")).text()).not.toContain("/stocks</loc>");
});

test("home: the nav's Start for $1 is recorded and opens /go", async ({ page }) => {
  const count = async (name: string) => (await q<{ n: number }>("select count(*)::int as n from terminal.events where name = $1", [name]))[0]!.n;
  const before = await count("unlock_click");
  await page.goto("/");
  await page.getByTestId("nav-start").click();
  await expect(page).toHaveURL(/\/go(\?|$)/);
  await expect.poll(() => count("unlock_click")).toBe(before + 1);
});

test("one font: headlines, body text, buttons and cards are all Schibsted Grotesk, and it loads", async ({ page }) => {
  await page.goto("/pricing");
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

test("outside the US, the market page links to the source market", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/market/0xe2emarket1");
  await expect(page.getByRole("link", { name: "See it on Polymarket" })).toHaveAttribute("href", /polymarket\.com/);
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
  await expect(first.getByLabel("Caption")).toHaveValue(/^0xe2…aa · Top-ranked trader: \$412K position on Chiefs to win\./);
  await expect(first.getByLabel("Caption")).toHaveValue(/Not financial advice\./);
});

test("home: no zero trader box or 0 won · 0 lost; the pricing page's one plan card", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/Big moves 0 |Total in \$0|\b0 won · 0 lost/);
  await page.goto("/pricing");
  // One plan card: $39/month, the $1 trial, Start for $1, five checkmarks; no "More coming" line.
  const card = page.getByTestId("plan-card");
  await expect(card).toContainText("$39/month");
  await expect(card).toContainText("$1 for your first 3 days. Cancel anytime.");
  await expect(card.getByRole("link", { name: "Start for $1" })).toBeVisible();
  await expect(card.locator("li")).toHaveCount(5);
  await expect(page.locator("main")).not.toContainText("More coming");
});

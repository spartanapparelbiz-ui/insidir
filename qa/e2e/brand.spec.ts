/* The brand pages end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts):
 *   Landing   the terminal in five blocks (hero, board, what you get, record, access + FAQ), the hero's words and its
 *             button above the fold, the board 60 minutes late with sides locked, two Start for $1 buttons and each tap
 *             recorded (hero, board row), the phones' sticky bar, at most 4 screens, no sideways scroll.
 *   The check a visitor checks a bet, picks a side, gets the verdict and its evidence (remembered on reload); the wallets,
 *             big bets and analyst line locked; a second check opens the paywall pop-up.
 *   /go       hook → categories → where → size → building → aha (one market whole, two with the side never sent) →
 *             paywall → the mock Whop checkout → the same markets whole → sign in with Whop → answers saved →
 *             follow a millionaire → push (not now) → their home.
 *   Home      a member's home: the homepage's stages, unlocked and live, with their desk; search inline. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";
import { MW } from "./seed-millionaires";

const post = (path: string, body: unknown) => fetch(`http://localhost:${WHOP_PORT}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const closed = { name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" };
test("landing: the terminal in five blocks; the board 60 minutes late with sides locked; two Start for $1 buttons, each tap recorded", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed]);
  await page.goto("/");
  // Five blocks, in order: hero, board, what you get, record, access + FAQ.
  const order = ["hero", "landing-board", "what-you-get", "landing-record", "pricing", "faq"];
  const ys = [];
  for (const id of order) { const el = page.getByTestId(id); await expect(el, id).toHaveCount(1); ys.push((await el.boundingBox())!.y); }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  await expect(page.getByTestId("hero").getByRole("heading", { level: 1 })).toHaveText("See what the $1M+ wallets bet, before the game.");
  await expect(page.getByTestId("hero-sub")).toHaveText("Every Polymarket bet of $5K+ from wallets up $1M+, with what it needs to win.");
  await expect(page.getByTestId("hero-price")).toHaveText("$1 for 3 days, then $39/month. Cancel anytime.");
  // The hero's button: above the fold, straight to /go; no nav Start button and no other orange above it.
  const start = page.getByTestId("hero-start");
  await expect(start).toHaveAttribute("href", "/go");
  expect((await start.boundingBox())!.y + (await start.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // The top bar's Start for $1 waits until the hero's button has scrolled away.
  await expect(page.getByTestId("nav-start")).toBeHidden();
  await expect(page.getByTestId("pricing-cta")).toHaveAttribute("href", "/go");
  await expect(page.locator('main [data-checkout]:not([data-checkout="sticky"]):not([data-checkout="nav"]):not([data-checkout="menu"])')).toHaveCount(2);
  // Proof stats are real: the watched $1M+ wallets always show with fixtures; none is a placeholder.
  for (const s of await page.getByTestId("hero-proof").locator("dd").allTextContents()) expect(s).toMatch(/^\$?[\d,.]+[KMB]?$|^\d+–\d+$/);
  // The board: up to 8 rows, every one at least 60 minutes old, the side locked ("MEMBERS"), no side sent.
  const rows = page.getByTestId("landing-row");
  expect(await rows.count()).toBeGreaterThan(0);
  expect(await rows.count()).toBeLessThanOrEqual(8);
  for (const r of await rows.all()) {
    await expect(r.locator("[data-locked=side]")).toHaveText("Members");
    const id = decodeURIComponent((await r.getAttribute("data-href"))!.replace("/bet/", ""));
    const at = (await q<{ at: Date }>("select at from terminal.millionaire_bets where id = $1", [id]))[0]?.at;
    if (at) expect(Date.now() - new Date(at).getTime()).toBeGreaterThanOrEqual(59 * 60_000);
  }
  await expect(page.getByTestId("landing-board")).toContainText("Members see these the minute they land, with the side.");
  await expect(page.getByTestId("what-you-get")).toContainText("Before you bet");
  await expect(page.getByTestId("what-you-get")).toContainText("WHILE YOU HOLD");
  await expect(page.getByTestId("what-you-get")).toContainText("AFTER IT SETTLES");
  await expect(page.getByTestId("landing-record").getByRole("link", { name: /Every settled bet, losses included/ }).or(page.getByTestId("landing-record").getByTestId("t-empty"))).toHaveCount(1);
  await expect(page.getByTestId("price-line")).toHaveText("$1 · 3 DAYS → $39/MO · CANCEL ANYTIME");
  expect(await page.getByTestId("faq-item").count()).toBeLessThanOrEqual(5);
  expect(await page.locator('script[type="application/ld+json"]').filter({ hasText: "FAQPage" }).count()).toBe(1);
  await expect(page.getByTestId("brand-foot")).toContainText("Gambling problem? Call 1-800-GAMBLER.");
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("brand-hero", page) });
  await page.screenshot({ path: shotName("brand-home", page), fullPage: true });

  // A board row's tap is recorded (where: landing) and opens the bet; the hero's tap is recorded as the hero's.
  const vid = (await context.cookies()).find(c => c.name === "insidir_vid")!.value;
  await rows.first().locator("td").first().click();
  await expect(page).toHaveURL(/\/bet\//);
  await expect.poll(async () => (await q("select 1 from terminal.events where visitor_id = $1 and name = 'board_row_click' and props->>'where' = 'landing'", [vid])).length, { timeout: 10_000 }).toBe(1);
  await page.goto("/");
  await page.getByTestId("hero-start").click();
  await expect(page).toHaveURL(/\/go/);
  await expect.poll(async () => (await q("select 1 from terminal.events where visitor_id = $1 and name = 'hero_cta_click' and props->>'where' = 'hero'", [vid])).length, { timeout: 10_000 }).toBeGreaterThan(0);
});

test("phones: the sticky Start appears once the board is past and hides at the pricing block; the page is at most 6 screens", async ({ page, context }, info) => {
  test.skip(info.project.name !== "phone-390", "phones only");
  await context.addCookies([closed]);
  await page.goto("/");
  const sticky = page.getByTestId("sticky-start");
  await expect(sticky).not.toHaveAttribute("data-on", "");
  const h = page.viewportSize()!.height;
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(6 * h);
  const y = await page.evaluate(() => { const b = document.querySelector('[data-testid="landing-board"]')!.getBoundingClientRect(); return b.bottom + window.scrollY + 4; });
  await page.evaluate(top => window.scrollTo(0, top), y);
  const pricingOn = await page.evaluate(() => document.querySelector('[data-testid="pricing"]')!.getBoundingClientRect().top < window.innerHeight);
  if (!pricingOn) await expect(sticky).toHaveAttribute("data-on", "");
  await page.getByTestId("pricing").scrollIntoViewIfNeeded();
  await expect(sticky).not.toHaveAttribute("data-on", "");
  await page.screenshot({ path: shotName("brand-free-sample", page) });
});

test("search (⌘K): markets by words, a pasted Polymarket link opens that market's page, a wallet by its address", async ({ page, context }) => {
  await signIn(context, "insidir");
  const words = await (await page.request.get("/api/search?q=tennis%20match%20100")).json() as { go: string | null; hits: Array<{ href: string; kind: string }> };
  expect(words.hits.map(h => h.href)).toContain("/market/0xe2etennis100");
  const link = await (await page.request.get(`/api/search?q=${encodeURIComponent("https://polymarket.com/event/e2e-tennis-100")}`)).json() as { go: string | null };
  expect(link.go === null || link.go.startsWith("/market/")).toBe(true);
  const w = await (await page.request.get("/api/search?q=0xe2e00000000000000000000000000000000000aa")).json() as { go: string | null };
  expect(w.go).toBe("/wallet/0xe2e00000000000000000000000000000000000aa");
  await page.goto("/?search=1");
  await page.getByLabel("Search markets, races and wallets, or paste a link").fill("tennis match 100");
  await page.getByLabel("Search markets, races and wallets, or paste a link").press("Enter");
  await expect(page.getByTestId("desk-search-result").locator('a[href="/market/0xe2etennis100"]')).toBeVisible();
});

test("/go: one question per screen, the aha, paywall, the mock checkout, unlocked, sign in, saved, follow, push, home", async ({ page }) => {
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width, email = `go-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/go?utm_source=e2e&utm_campaign=brand");
  const go = page.getByTestId("go");
  await expect(go).toHaveAttribute("data-step", "hook");
  await expect(page.getByTestId("go-hook-bet")).toContainText(/A \$1M\+ wallet just bet \$[\d.]+K on E2E fixture/); // a visitor never gets the wallet's record
  await page.screenshot({ path: shotName("go-1-hook", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "cats");
  await expect(page.getByTestId("go-tile")).toHaveCount(19);
  await page.locator('[data-testid=go-tile][data-cat=football]').click();
  await page.locator('[data-testid=go-tile][data-cat=politics]').click();
  await expect(page.locator('[data-testid=go-tile][data-cat=football]')).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: shotName("go-2-categories", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "where");
  await page.locator('[data-testid=go-answer][data-value=kalshi]').click();
  await expect(go).toHaveAttribute("data-step", "size");
  await page.locator('[data-testid=go-answer][data-value="25-100"]').click();
  await expect(go).toHaveAttribute("data-step", "building");
  await expect(page.getByTestId("go-ticks")).toContainText("Reading 6 millionaire wallets");
  await expect(page.getByTestId("go-ticks")).toContainText("bets in Football and Politics today");
  await expect(go).toHaveAttribute("data-step", "aha", { timeout: 10_000 });
  // One market whole; the others with one total and the side never sent.
  await expect(page.getByTestId("aha-open")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked").locator("[data-locked=split]")).toHaveCount(1); // the side drawn from nothing
  await expect(page.getByTestId("go-record")).toHaveText("“Bets of $50K+”: +$412 on $25 a bet, 64 won of 118 settled on Kalshi in 180 days, at the ask + 1¢. Past results, not a promise. Every rule we tested.");
  await expect(page.getByTestId("go-aha")).not.toContainText("on every");
  await page.screenshot({ path: shotName("go-6-aha", page), fullPage: true });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("paywall-headline")).toHaveText("See which side they took in Football and Politics.");
  await expect(page.getByTestId("paywall-record")).toHaveText("“Bets of $50K+”: +$412 on $25 a bet, 64 won of 118 settled on Kalshi in 180 days, at the ask + 1¢. Past results, not a promise.");
  await expect(page.getByTestId("paywall-timeline")).toContainText("Today $1");
  await expect(page.getByTestId("paywall-remind")).toBeChecked();
  // The panel fades in (st 0.3s + its own transition): capture it settled, not mid-entrance.
  await page.getByTestId("go-paywall").evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
  await page.waitForTimeout(800);
  await page.screenshot({ path: shotName("go-7-paywall", page) });
  await page.getByTestId("paywall-start").click();
  await expect(go).toHaveAttribute("data-step", "checkout");
  await page.getByTestId("age-18").getByRole("checkbox").check();
  const form = page.locator("[data-mock-checkout]");
  await expect(form).toBeVisible();
  await page.screenshot({ path: shotName("go-8-checkout", page) });
  await post("/__whop_user", { email, name: "Go Buyer" });
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  // Back to the same markets, now whole.
  await expect(page).toHaveURL(/\/go\?step=unlocked/, { timeout: 20_000 });
  await expect(page.getByTestId("aha-locked")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("aha-open")).toHaveCount(2);
  await page.screenshot({ path: shotName("go-9-unlocked", page), fullPage: true });
  await page.getByTestId("go-signin").click();
  // Right after paying and signing in: the ping opt-in, then follow a millionaire.
  await expect(go).toHaveAttribute("data-step", "push", { timeout: 25_000 });
  await page.screenshot({ path: shotName("go-10-push", page) });
  await page.getByTestId("ping-next").click();
  await expect(go).toHaveAttribute("data-step", "follow");
  const saved = (await q<{ settings: { go: { categories: string[]; where: string; size: string }; betOn: string[]; remindBeforeCharge: boolean }; utm: Record<string, string> | null }>("select settings, utm from terminal.users where email = $1", [email]))[0]!;
  expect(saved.settings.go).toEqual({ categories: ["football", "politics"], where: "kalshi", size: "25-100" });
  expect(saved.settings.betOn).toEqual(["nfl", "cfb", "other"]);
  expect(saved.settings.remindBeforeCharge).toBe(true);
  expect(saved.utm).toMatchObject({ utm_source: "e2e", utm_campaign: "brand" });
  await expect(page.getByTestId("go-wallet").first()).toContainText("Millionaire");
  await page.getByTestId("go-follow-btn").first().click();
  await expect(page.getByTestId("go-follow-btn").first()).toHaveText("Following");
  await page.screenshot({ path: shotName("go-11-follow", page) });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("member-home")).toBeVisible({ timeout: 15_000 });
});

test("a member's home is the workspace: panels (board, watch my bet, alerts, wallet monitor, market, Bet Briefing, Daily Brief, Ask Insidir, today's #1 position, desk), keyboard on the board, search in the top bar", async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(context, "insidir");
  await page.goto("/");
  await expect(page.locator('[data-home="workspace"]')).toBeVisible();
  // The first panel: a computed headline about today's (or the last 24 hours') millionaire money.
  await expect(page.getByTestId("home-hero").getByRole("heading", { level: 1 })).toHaveText(/^Wallets up \$1M\+ bet \$[\d.]+[KM] (today|in the last 24 hours)\.$/);
  // Every panel has a title.
  for (const id of ["home-board", "home-watch", "home-alerts", "home-monitor", "home-market", "home-briefing", "home-brief", "home-ask", "home-top", "home-desk"]) {
    const p = page.getByTestId(id);
    await expect(p, id).toBeVisible();
    await expect(p.locator(".t-panel__title").first(), id).not.toBeEmpty();
  }
  // Today's #1 open position: $85K on the Chiefs (now 51¢); every millionaire entry on that side, $85K + $20K, at an
  // average 47¢; then Copy at the price now and Follow.
  const t = page.getByTestId("home-ticket");
  await expect(t).toContainText("E2E fixture: Chiefs vs. Bills");
  await expect(t).toContainText("$105K from wallets up $1M+");
  await expect(t).toContainText("in at 47¢ · now 51¢");
  await expect(t.getByTestId("ticket-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  await expect(t.getByTestId("ticket-copy")).toHaveText("Copy at 51¢");
  await expect(t.getByTestId("desk-follow")).toBeVisible();
  // Never a wallet's face: the ticket names a short address and its profit only.
  await expect(t).toContainText(/0xe2e0…0001 · \+\$3\.1M all-time/);
  // The live board, a terminal table: no logos, sides shown, every row explained; Copy only on the selected row.
  const board = page.getByTestId("live-board");
  await board.scrollIntoViewIfNeeded();
  await expect(board.getByTestId("bet-row").first()).toHaveAttribute("data-bet", "e2e:mb4");
  await expect(board.locator("img")).toHaveCount(0);
  await expect(board.locator('[data-locked="side"]')).toHaveCount(0);
  expect(await board.getByTestId("bet-explain").count()).toBe(await board.getByTestId("bet-row").count());
  await expect(board.getByTestId("bet-copy")).toHaveCount(0);
  await board.getByTestId("bet-row").first().locator("button").first().click();
  await expect(board.getByTestId("bet-copy")).toHaveCount(1);
  await expect(board.getByTestId("bet-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  // The Bet Briefing for the Market panel's market: wins if, price and payout, the big money, the read.
  await expect(page.getByTestId("home-briefing").getByTestId("briefing-section").first()).toBeVisible();
  // Their desk: copies, follows, pings; never a stat that reads 0.
  const desk = page.getByTestId("home-desk");
  await expect(desk.getByTestId("desk-follows")).not.toContainText(/^0$/m);
  // The type: IBM Plex Sans with tabular figures; no sidebar.
  expect(await page.getByTestId("home-board").locator("td").first().evaluate(e => getComputedStyle(e).fontFamily)).toMatch(/plex.?sans/i);
  await expect(page.locator(".b-sidebar")).toHaveCount(0);
  // Ask Insidir: an example question answered from Insidir's data (or "I don't have that."), never empty.
  await page.getByTestId("home-ask-example").first().click();
  await expect(page.getByTestId("home-ask-text")).toHaveText(/\S/, { timeout: 30_000 });
  await page.screenshot({ path: shotName("brand-home", page) });
  await noHorizontalScroll(page);
  // Keyboard: arrow keys select board rows, Enter opens the bet.
  await page.getByTestId("board-table").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(board.locator('tr[aria-selected="true"]')).toHaveAttribute("data-bet", "e2e:mb4");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/bet\/e2e%3Amb4$/);
});

test("the terminal's command line finds a market from the member home (search is in the top bar)", async ({ page, context }, info) => {
  test.skip(info.project.name === "phone-390", "phones open the command line from the search key; covered on desktop");
  await signIn(context, "insidir");
  await page.goto("/");
  // Search: a market in plain words comes back inline. (Tennis match 100 has millionaire money: $74K + $40K on Player A.)
  await page.getByTestId("t-cmd").getByRole("textbox").fill("Tennis match 100");
  await page.getByTestId("t-cmd").getByRole("textbox").press("Enter");
  await expect(page.getByTestId("desk-search-result").locator('a[href="/market/0xe2etennis100"]')).toBeVisible({ timeout: 10_000 });
});

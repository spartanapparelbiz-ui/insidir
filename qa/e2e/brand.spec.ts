/* The brand pages end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts):
 *   Landing   the stages in order, the hero's words and CTAs, the four pain → fix rows, the check demo picking a side
 *             and its verdict landing, the live feed with sides locked for a visitor (never sent), a tap on a lock
 *             opening the paywall, the proof record, pricing, no sideways scroll.
 *   The check a visitor checks a bet, picks a side, gets the verdict and its evidence (remembered on reload); the wallets,
 *             big bets and analyst line locked; a second check opens the paywall pop-up.
 *   /go       hook → categories → where → size → building → aha (one market whole, two with the side never sent) →
 *             paywall → the mock Whop checkout → the same markets whole → sign in with Whop → answers saved →
 *             follow a millionaire → push (not now) → their home.
 *   Home      a member's: greeting, Check a bet, the feed with sides, their panels. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";
import { MW } from "./seed-millionaires";

const post = (path: string, body: unknown) => fetch(`http://localhost:${WHOP_PORT}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const closed = { name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" };

test("landing: the stages, the check demo's verdict, sides locked for visitors, a lock opens the paywall", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed]);
  await page.goto("/");
  const order = ["hero", "problem", "check", "live", "markets", "proof", "pricing", "faq", "final-cta"];
  const ys = [];
  for (const id of order) { const el = page.getByTestId(id); await expect(el, id).toHaveCount(1); ys.push((await el.boundingBox())!.y); }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  await expect(page.getByTestId("hero").getByRole("heading", { level: 1 })).toHaveText("You're bettingagainst millionaires.");
  await expect(page.getByTestId("hero-line")).toHaveText(/^Wallets up \$1M\+ bet \$[\d.]+[KM] (today|in the last 24 hours)\. Which side were you on\?$/);
  await expect(page.getByTestId("hero-check")).toHaveAttribute("href", "#check");
  await expect(page.getByTestId("hero-start")).toHaveAttribute("href", "/go");
  await expect(page.getByTestId("pain-row")).toHaveCount(4);
  await expect(page.getByTestId("pain-row").first()).toContainText("You can't see who's on the other side.Millionaire money on every market, live.");
  await page.screenshot({ path: shotName("brand-hero", page) });

  // The check demo: the market with the most millionaire money and a real split (Chiefs vs. Bills, 3 wallets) picks
  // the heavier side, and the verdict lands.
  const demo = page.getByTestId("demo-check");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toContainText("E2E fixture: Chiefs vs. Bills");
  await expect(demo.getByTestId("pick-yes")).toHaveText("Chiefs");
  await expect(demo).toHaveAttribute("data-verdict", "agree", { timeout: 10_000 });
  await expect(demo.getByTestId("verdict-headline")).toHaveText("✓ Millionaires agree with you");
  await expect(demo.getByTestId("verdict-evidence")).toHaveText("$105K on Chiefs from 2 wallets, $30K on Bills from 1 wallet");
  await expect(demo).toContainText("Chiefs 51¢ · Bills 49¢");
  await expect(demo).toContainText("Information, not advice.");
  await page.screenshot({ path: shotName("brand-check", page) });

  // The live feed: every bet, live, with its side locked; the sides are never in the page.
  const feed = page.getByTestId("live-feed");
  await feed.scrollIntoViewIfNeeded();
  await expect(feed.getByTestId("bet-row").first()).toBeVisible();
  await expect(feed.locator("[data-locked=side]").first()).toBeVisible();
  const html = await feed.innerHTML();
  expect(html).not.toMatch(/b-side--(yes|no)/);
  expect(html).not.toContain(MW(1));
  // A tap on a lock: the paywall, with that wallet's profit and the full price.
  await feed.locator("[data-locked=side]").first().click();
  const sheet = page.getByTestId("pay-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("paywall-headline")).toContainText(/This wallet is up \$[\d.]+[MK]\. See which side it took\. \$1 for 3 days\./);
  await expect(sheet.getByTestId("paywall-price")).toContainText("$1 today, then $39/month from");
  await expect(sheet.getByTestId("paywall-remind")).toBeChecked();
  await page.screenshot({ path: shotName("brand-popup", page) });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Proof: the millionaires' own record (30 settled: 20 won at 45¢ + a cent, 10 lost) and the quiet line.
  await expect(page.getByTestId("proof-net")).toHaveText("+$1,348");
  await expect(page.getByTestId("proof")).toContainText("$100 on every millionaire bet · 30 settled");
  await expect(page.getByTestId("proof")).toContainText("Past results, not a promise.");
  await expect(page.getByTestId("pricing")).toContainText("Less thanone bad bet.");
  await expect(page.getByTestId("price-line")).toHaveText("$1 for three days, then $39 a month. Cancel anytime.");
  await expect(page.getByTestId("final-cta").getByRole("heading")).toHaveText("Bet with themillionaires.");
  await expect(page.getByTestId("brand-foot")).toContainText("Gambling problem? Call 1-800-GAMBLER.");
  await noHorizontalScroll(page);
});

test("the check: pick your side, the verdict and its evidence (remembered), locked details, the second check opens the paywall", async ({ page, context }) => {
  test.setTimeout(60_000);
  const vid = `e2e-check-${page.viewportSize()!.width}-${Date.now()}`;
  await context.addCookies([{ name: "insidir_vid", value: vid, url: "http://localhost:3100" }]);
  await page.goto("/");
  await page.getByTestId("check").getByTestId("ask-input").fill("Tennis match 100");
  await page.getByTestId("check").getByTestId("ask-go").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 15_000 });
  const card = page.getByTestId("check-card");
  await expect(page.getByTestId("read-head").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  await expect(card).toContainText("Which side are you on?");
  await expect(card.getByTestId("verdict")).toHaveCount(0);
  await page.screenshot({ path: shotName("brand-read-side", page) });
  await card.getByTestId("pick-yes").click();
  await expect(card).toHaveAttribute("data-verdict", "agree");
  await expect(card.getByTestId("verdict-headline")).toHaveText("✓ Millionaires agree with you");
  await expect(card.getByTestId("verdict-evidence")).toHaveText("2 wallets with $1M+ all-time profit have $114K on Player A");
  await expect(card.getByTestId("read-locked")).toBeVisible();
  await expect(card.getByTestId("read-line-locked")).toBeVisible();
  await expect(card.getByTestId("read-wallets-locked")).toBeVisible();
  await expect(page.getByTestId("read-advice")).toContainText("Information, not financial or betting advice.");
  await page.screenshot({ path: shotName("brand-read-verdict", page), fullPage: true });
  // Remembered per market.
  await page.reload();
  await expect(page.getByTestId("check-card")).toHaveAttribute("data-verdict", "agree");
  // The free check is used: the next one opens the paywall pop-up.
  await page.getByTestId("read-again").getByTestId("ask-input").fill("Chiefs vs. Bills");
  await page.getByTestId("read-again").getByTestId("ask-go").click();
  await expect(page.getByTestId("pay-sheet")).toHaveAttribute("data-kind", "limit", { timeout: 15_000 });
  await expect(page.getByTestId("paywall-headline")).toHaveText("You've used your free check. Check every bet for $1 for 3 days.");
  await noHorizontalScroll(page);
});

test("/go: one question per screen, the aha, paywall, the mock checkout, unlocked, sign in, saved, follow, push, home", async ({ page }) => {
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width, email = `go-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/go?utm_source=e2e&utm_campaign=brand");
  const go = page.getByTestId("go");
  await expect(go).toHaveAttribute("data-step", "hook");
  await expect(page.getByTestId("go-hook-bet")).toContainText(/A \+\$[\d.]+[MK] wallet just bet \$[\d.]+K on E2E fixture/);
  await page.screenshot({ path: shotName("go-1-hook", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "cats");
  await expect(page.getByTestId("go-tile")).toHaveCount(18);
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
  await expect(page.getByTestId("go-ticks")).toContainText("Checking 6 millionaire wallets");
  await expect(page.getByTestId("go-ticks")).toContainText("bets in Football and Politics today");
  await expect(go).toHaveAttribute("data-step", "aha", { timeout: 10_000 });
  // One market whole; the others with one total and the side never sent.
  await expect(page.getByTestId("aha-open")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked").locator("[data-locked=split]")).toHaveCount(1); // the side drawn from nothing
  await expect(page.getByTestId("go-stake")).toContainText("$50 on every millionaire bet: +$674 over 30 settled. Past results, not a promise.");
  await page.screenshot({ path: shotName("go-6-aha", page), fullPage: true });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("paywall-headline")).toHaveText("Every millionaire bet on Football and Politics, live.");
  await expect(page.getByTestId("paywall-timeline")).toContainText("Today $1");
  await expect(page.getByTestId("paywall-remind")).toBeChecked();
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
  await expect(go).toHaveAttribute("data-step", "follow", { timeout: 25_000 });
  const saved = (await q<{ settings: { go: { categories: string[]; where: string; size: string }; betOn: string[]; remindBeforeCharge: boolean }; utm: Record<string, string> | null }>("select settings, utm from terminal.users where email = $1", [email]))[0]!;
  expect(saved.settings.go).toEqual({ categories: ["football", "politics"], where: "kalshi", size: "25-100" });
  expect(saved.settings.betOn).toEqual(["nfl", "cfb", "other"]);
  expect(saved.settings.remindBeforeCharge).toBe(true);
  expect(saved.utm).toMatchObject({ utm_source: "e2e", utm_campaign: "brand" });
  await expect(page.getByTestId("go-wallet").first()).toContainText("Millionaire");
  await page.getByTestId("go-follow-btn").first().click();
  await expect(page.getByTestId("go-follow-btn").first()).toHaveText("Following");
  await page.screenshot({ path: shotName("go-10-follow", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "push");
  await page.screenshot({ path: shotName("go-11-push", page) });
  await page.getByTestId("go-push-skip").click();
  await expect(page.getByTestId("member-home")).toBeVisible({ timeout: 15_000 });
});

test("a member's home: greeting, Check a bet, the feed with sides, their panels", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/");
  const home = page.getByTestId("member-home");
  await expect(home.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), user_e2e_insidir\.$/);
  await expect(home.getByTestId("ask-go")).toHaveText("Check");
  await expect(page.getByTestId("live-feed").getByTestId("bet-row").first()).toBeVisible();
  await expect(page.getByTestId("live-feed").locator("[data-locked]")).toHaveCount(0);
  for (const id of ["your-markets", "following-panel", "week-recap"]) await expect(page.getByTestId(id)).toBeVisible();
  if (page.viewportSize()!.width > 860) await expect(page.getByTestId("side-check")).toHaveText("Check a bet");
  else await expect(page.getByTestId("tab-check")).toBeVisible();
  await page.screenshot({ path: shotName("brand-dashboard", page) });
  await noHorizontalScroll(page);
});

/* The brand pages end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts):
 *   Landing   the stages in order, the hero's words and CTAs, the four pain → fix rows, the check demo picking a side
 *             and its verdict landing, the live feed with sides locked for a visitor (never sent), a tap on a lock
 *             opening the paywall, the proof record, pricing, no sideways scroll.
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

test("homepage: hero with the live window, three live numbers, Track / Verify / Signal, two real screens, one pricing card, the footer", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed]);
  await page.goto("/");
  const order = ["hero", "live-window", "hero-stats", "how", "product", "pricing", "brand-foot"];
  const ys = [];
  for (const id of order) { const el = page.getByTestId(id); await expect(el, id).toHaveCount(1); ys.push((await el.boundingBox())!.y); }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  // Three live numbers from the seeded database: 4 wallets up $1M+ tracked, 3 verified, signals sent in 24 hours.
  const stats = page.getByTestId("hero-stats");
  await expect(stats).toContainText("4Tracked");
  await expect(stats).toContainText("3Verified");
  await expect(stats).toContainText(/\d+Signals/);
  await expect(page.getByTestId("how").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("how")).toContainText("Track");
  await expect(page.getByTestId("how")).toContainText("Every wallet up $1M+, every position, live.");
  // The two screens are real: the newest settled fixture trade as its signal read, and the settled ledger with a loss.
  await expect(page.getByTestId("product-signal")).toContainText(/opened \$10K on Yes in “E2E fixture: settled market \d+” at 45¢\./);
  await expect(page.getByTestId("product-ledger").locator("tbody tr")).toHaveCount(6);
  await expect(page.getByTestId("pricing")).toContainText("$1 for 3 days, then $39/mo.");
  await expect(page.getByTestId("pricing-cta")).toHaveText("Start for $1");
  await expect(page.getByTestId("brand-foot")).toContainText("Information, not advice. Verified wallets lose trades too. 18+.");
  await expect(page.getByTestId("brand-foot")).not.toContainText("GAMBLER");
  await page.screenshot({ path: shotName("brand-hero", page) });
  await noHorizontalScroll(page);
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
  await expect(go).toHaveAttribute("data-step", "building");
  await expect(page.getByTestId("go-ticks")).toContainText("Reading 6 millionaire wallets");
  await expect(page.getByTestId("go-ticks")).toContainText("trades in Football and Politics today");
  await expect(go).toHaveAttribute("data-step", "aha", { timeout: 10_000 });
  // One market whole; the others with one total and the side never sent.
  await expect(page.getByTestId("aha-open")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked").locator("[data-locked=split]")).toHaveCount(1); // the side drawn from nothing
  await expect(page.getByTestId("go-record")).toHaveText("“Bets of $50K+”: +$412 on $25 a trade, 64 won of 118 settled on Kalshi in 180 days, at the ask + 1¢. Past results, not a promise. Every rule we tested.");
  await expect(page.getByTestId("go-aha")).not.toContainText("on every");
  await page.screenshot({ path: shotName("go-6-aha", page), fullPage: true });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("paywall-headline")).toHaveText("See which side they took in Football and Politics.");
  await expect(page.getByTestId("paywall-record")).toHaveText("“Bets of $50K+”: +$412 on $25 a trade, 64 won of 118 settled on Kalshi in 180 days, at the ask + 1¢. Past results, not a promise.");
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
  // Right after paying and signing in: sizing (bankroll and max per trade), the signal opt-in, then follow a wallet.
  await expect(go).toHaveAttribute("data-step", "bankroll", { timeout: 25_000 });
  await page.getByTestId("go-bankroll-input").fill("2000");
  await page.getByTestId("go-max-input").fill("100");
  await page.screenshot({ path: shotName("go-9b-sizing", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "push", { timeout: 15_000 });
  await page.screenshot({ path: shotName("go-10-push", page) });
  await page.getByTestId("ping-next").click();
  await expect(go).toHaveAttribute("data-step", "follow");
  const saved = (await q<{ settings: { go: { categories: string[]; where: string; size: string }; betOn: string[]; remindBeforeCharge: boolean }; utm: Record<string, string> | null }>("select settings, utm from terminal.users where email = $1", [email]))[0]!;
  expect(saved.settings.go).toEqual({ categories: ["football", "politics"], where: "kalshi", size: null });
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

test("a member's home is the homepage, unlocked: stages with computed headlines, today's #1 position as a ticket, the live board with Copy on the selected row only, their desk; search inline", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/");
  await expect(page.locator('[data-home="stages"]')).toBeVisible();
  // The hero: a computed headline about today's (or the last 24 hours') millionaire money, on the homepage's stage.
  await expect(page.getByTestId("home-hero").getByRole("heading", { level: 1 })).toHaveText(/^Wallets up \$100K\+ traded \$[\d.]+[KM] (today|in the last 24 hours)\.$/);
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
  // The live board: written rows, no logos; Copy appears only on the selected row.
  const board = page.getByTestId("live-board");
  await board.scrollIntoViewIfNeeded();
  await expect(board.getByTestId("bet-row").first()).toHaveAttribute("data-bet", "e2e:mb4");
  await expect(board.locator("img")).toHaveCount(0);
  await expect(board.getByTestId("bet-copy")).toHaveCount(0);
  await board.getByTestId("bet-row").first().locator("button").first().click();
  await expect(board.getByTestId("bet-copy")).toHaveCount(1);
  await expect(board.getByTestId("bet-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  // Their desk: copies, follows, pings; never a stat that reads 0.
  const desk = page.getByTestId("home-desk");
  await expect(desk.getByTestId("desk-follows")).not.toContainText(/^0$/m);
  // No monospace anywhere, no sidebar.
  expect(await page.evaluate(() => [...document.querySelectorAll("main *")].some(e => /mono/i.test(getComputedStyle(e).fontFamily)))).toBe(false);
  await expect(page.locator(".b-sidebar")).toHaveCount(0);
  // Search: a market in plain words comes back inline with its millionaire side.
  // (Tennis match 100 has millionaire money: $74K + $40K on Player A.)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("desk-search").getByRole("textbox").fill("Tennis match 100");
  await page.getByTestId("desk-search").getByRole("textbox").press("Enter");
  await expect(page.getByTestId("desk-search-result").locator('a[href="/market/0xe2etennis100"]')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: shotName("brand-home", page) });
  await noHorizontalScroll(page);
});

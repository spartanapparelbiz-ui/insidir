/* The Read, end to end against the seeded fixtures (qa/e2e/seed.ts). The open tennis position 100 is E2E-Follow's
 * ($90K on Player A at 52¢; E2E-Follow is proven: 32 settled, a positive followable return), on Polymarket at 58¢ and
 * matched to a Kalshi market that pays the other way round (Kalshi YES 40¢ → Player A 60¢ there).
 *   A visitor (region unknown = the US rule): types the market, gets one Read in under 5 seconds: the split and Kalshi's
 *   price only (no Polymarket anywhere); the big bets and the analyst line blurred and never sent; Open on Kalshi;
 *   Share is a 1080×1350 PNG; a second Read asks for $1. Start for $1 → pay first (no sign-in) → Whop sign-in → back
 *   on the same Read as a member: the big bets and the line.
 *   A member outside the US: "tennis" reads the main tennis market (paired, the most tracked money); both venues with
 *   the better price marked, Open on it; the Read is on their home page. A visitor: a Read with no money doesn't count;
 *   picking from "Which one?" doesn't use up the free Read (the other match is a tap away under it); a new search does.
 *   Home: tonight's markets with proven money, one tap each. /admin shows landing → first Read and → paid. */
import { expect, test, type Page } from "@playwright/test";
import { TRIAL } from "@/lib/plans";
import { base32Decode, stepAt, totpCode } from "@/lib/admin";
import { SERVER_ENV, WHOP_PORT } from "./env";
import { q, shotName, signIn } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// A game tonight with big money on it, tagged NFL as the worker tags it: the member home's "Tonight in your leagues".
test.beforeAll(async () => {
  await q("delete from terminal.moves where id = 'e2e:tonight'");
  await q("delete from terminal.market_info where market_id = '0xe2etonight'");
  await q(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, league, category, trackers)
    values ('e2e:tonight', 'polymarket', '0xe2etonight', 'E2E fixture: Jets vs. Dolphins', 'E2E fixture: Jets vs. Dolphins', 'Jets', 'yes', 75000, 0.47, '0xe2e00000000000000000000000000000000000ee', now() - interval '1 hour', now() - interval '1 hour', 'sports', 'NFL', 'sports', array['nfl-big-money'])`);
  await q("insert into terminal.market_info (source, market_id, yes_price, closed, start_at, updated_at) values ('polymarket', '0xe2etonight', 0.48, false, now() + interval '3 hours', now())");
});
test.afterAll(async () => {
  await q("delete from terminal.moves where id = 'e2e:tonight'");
  await q("delete from terminal.market_info where market_id = '0xe2etonight'");
});

/** A visitor's free check, inline on the landing (the free tile), then its full page. */
async function freeCheck(page: Page, text: string, side: "yes" | "no" = "yes"): Promise<string> {
  await page.goto("/#check");
  const tile = page.getByTestId("free-check-tile");
  await tile.getByTestId("ask-input").fill(text);
  const t0 = Date.now();
  await tile.getByTestId("ask-go").click();
  await expect(tile.getByTestId("free-check")).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(5_000);
  await tile.getByTestId(`pick-${side}`).click();
  await tile.getByRole("link", { name: "Open the full check" }).click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  return page.url();
}

/** A member's check, from the box on their home. */
async function memberCheck(page: Page, text: string) {
  await page.goto("/");
  await page.getByTestId("member-home").getByTestId("ask-input").fill(text);
  await page.getByTestId("member-home").getByTestId("ask-go").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("check-card")).toBeVisible();
}

test("a visitor's free check (US rule), wallets, bets and line never sent, Share, then pay first and back on the same check as a member", async ({ page, context }) => {
  test.setTimeout(150_000);
  const w = page.viewportSize()!.width;
  const email = `reader-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await context.addCookies([{ name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" }]);
  const url = await freeCheck(page, "Tennis match 100");
  const id = url.split("/read/")[1]!;
  await expect(page.getByTestId("read-head").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  // The side they picked on the landing is remembered here, and the verdict leads.
  const card = page.getByTestId("check-card");
  await expect(card).toHaveAttribute("data-verdict", "agree");
  await expect(card.getByTestId("verdict-evidence")).toHaveText("2 wallets with $1M+ all-time profit have $114K on Player A");
  // The US rule: Kalshi only. Player A is Kalshi's NO (the pair is inverted): 60¢; the other side 40¢.
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢"]);
  await expect(page.getByTestId("price-polymarket")).toHaveCount(0);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Kalshi");
  await expect(page.getByTestId("read-open")).toHaveAttribute("href", "https://kalshi.com/markets/e2e/KXE2ETENNIS-100");
  await expect(page.locator('a[href*="polymarket.com"]')).toHaveCount(0);
  // The wallets, the bets and the line: drawn from nothing, and not in the page at all.
  await expect(page.getByTestId("read-locked")).toContainText("1 big bet in the last 24 hours");
  await expect(page.getByTestId("read-wallets-locked")).toContainText("3 wallets: each one's side, size and profit");
  await expect(page.getByTestId("read-bets")).toHaveCount(0);
  await expect(page.getByTestId("read-line")).toHaveCount(0);
  const html = await (await page.request.get(url)).text();
  expect(html).not.toMatch(/\$90K on Player A|0xe2e0…0001|0xe2e00000000000000000000000000000000000001/);
  await page.screenshot({ path: shotName("read-visitor", page), fullPage: true });
  // Share: the image, 1080×1350, insidir.com on it.
  const img = await page.request.get(`/read/${id}/image`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  const png = await img.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  // A second check: the paywall (it's their tap, so it opens even though pop-ups were closed).
  await page.getByTestId("read-again").getByTestId("ask-input").fill("Tennis match 101");
  await page.getByTestId("read-again").getByTestId("ask-go").click();
  await expect(page.getByTestId("pay-sheet")).toHaveAttribute("data-kind", "limit", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  // From a locked row: the paywall, pay first (no sign-in), Whop sign-in, set up, and back on this check as a member.
  await page.getByTestId("read-locked").getByRole("link").click();
  await page.getByTestId("pay-sheet").getByTestId("paywall-start").click();
  await expect(page).toHaveURL(new RegExp(`/go\\?step=checkout&next=%2Fread%2F${id}`));
  await post("/__whop_user", { email, name: null });
  await page.getByTestId("age-18").getByRole("checkbox").check();
  const form = page.locator("[data-mock-checkout]");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  await expect(page).toHaveURL(/\/go\?step=unlocked/, { timeout: 25_000 });
  await page.getByTestId("go-signin").click();
  // Right after paying: the ping opt-in, then follow a millionaire, then back on the same check.
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "push", { timeout: 25_000 });
  await page.getByTestId("go-push-skip").click();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "follow");
  await page.getByTestId("go-next").click();
  await expect(page).toHaveURL(url, { timeout: 15_000 });
  await expect(page.getByTestId("read-bets")).toContainText("$90K on Player A at 52¢");
  await expect(page.getByTestId("read-wallets")).toContainText("0xe2e0…0001");
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  expect(await page.getByTestId("read-line").innerText()).not.toMatch(/guarantee|should|insider/i);
  await expect(page.getByTestId("read-locked")).toHaveCount(0);
  await expect(page.getByTestId("read-advice")).toHaveText("Information, not financial or betting advice. Public data from Polymarket and Kalshi.");
  await page.screenshot({ path: shotName("read-after-pay", page), fullPage: true });
  // Their home: this check in Your checks.
  await page.goto("/");
  await expect(page.getByTestId("your-markets").locator("a").first()).toContainText("E2E fixture: Tennis match 100");
});

test("a member outside the US: \"tennis\" checks the main market, both venues with the better price marked, Open on it; on their home after", async ({ page, context }) => {
  await signIn(context, "proIntl");
  // Tennis match 100 is the main tennis market: paired with Kalshi and the most tracked money ($90K against $60K, $45K).
  await memberCheck(page, "tennis");
  await expect(page.getByTestId("read-head").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  await page.getByTestId("check-card").getByTestId("pick-no").click();
  await expect(page.getByTestId("check-card")).toHaveAttribute("data-verdict", "against");
  // Player A: Kalshi 60¢, Polymarket 58¢ (better); the other side: Kalshi 40¢ (better), Polymarket 42¢.
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢ · best"]);
  await expect(page.getByTestId("price-polymarket")).toHaveText(["58¢ · best", "42¢"]);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Polymarket");
  await expect(page.getByTestId("read-bets")).toBeVisible();
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  await page.screenshot({ path: shotName("read-member-intl", page), fullPage: true });
  await page.goto("/");
  await expect(page.getByTestId("your-markets").locator("a").first()).toContainText("E2E fixture: Tennis match 100");
});

test("the free check: a check with no money doesn't use it up; markets \"Which one?\" offered stay a tap away; a new search after that asks for $1", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([{ name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" }]);
  await q("delete from terminal.markets where id = '0xe2equiet'");
  await q(`insert into terminal.markets (venue, id, data) values ('polymarket', '0xe2equiet', $1)`, [JSON.stringify({ venue: "polymarket", id: "0xe2equiet", title: "E2E fixture: Quiet market", eventTitle: null, yesLabel: "Yes", noLabel: "No", url: "https://polymarket.com/event/e2e-quiet", yesPrice: 0.5, volume24h: 1000, active: true, result: null, closeTime: Date.now() + 30 * 86_400_000 })]);
  try {
    await page.goto("/#check");
    const tile = page.getByTestId("free-check-tile");
    // A market with no money: it says so, and it isn't the free check.
    await tile.getByTestId("ask-input").fill("Quiet market");
    await tile.getByTestId("ask-go").click();
    await tile.getByTestId("pick-yes").click();
    await expect(tile.getByTestId("verdict-headline")).toHaveText("No millionaire money here yet");
    // Two markets fit equally: "Which one?". Picking one checks it, and doesn't use the free check up either.
    await tile.getByTestId("ask-input").fill("Tennis match 101 102");
    await tile.getByTestId("ask-go").click();
    const choices = tile.getByTestId("ask-choices").locator("button");
    await expect(choices).toHaveCount(2);
    await page.screenshot({ path: shotName("read-choices", page), fullPage: false });
    await choices.filter({ hasText: "Tennis match 102" }).click();
    await expect(tile.getByTestId("free-check")).toContainText("E2E fixture: Tennis match 102");
    // ...and the other one is still a tap away, without using the free check.
    await expect(tile.getByTestId("ask-choices")).toContainText("Not this one? Your other matches");
    await tile.getByTestId("ask-choices").locator("button").filter({ hasText: "Tennis match 101" }).click();
    await expect(tile.getByTestId("free-check")).toContainText("E2E fixture: Tennis match 101");
    // A new search is a new check: that one opens the paywall (the markets "Which one?" offered stay open either way).
    await tile.getByTestId("ask-input").fill("Tennis match 100");
    await tile.getByTestId("ask-go").click();
    await expect(page.getByTestId("pay-sheet")).toHaveAttribute("data-kind", "limit", { timeout: 10_000 });
  } finally {
    await q("delete from terminal.markets where id = '0xe2equiet'");
  }
});

test("the landing's chips are the busiest markets: one tap checks it, inline", async ({ page }) => {
  await page.goto("/#check");
  const tile = page.getByTestId("free-check-tile");
  const chip = tile.getByTestId("ask-chip").first();
  await expect(chip).toContainText("E2E fixture");
  const label = (await chip.innerText()).trim();
  await chip.click();
  await expect(tile.getByTestId("free-check")).toContainText(label.replace(/…$/, ""), { timeout: 10_000 });
  await expect(page).toHaveURL(/\/(#check)?$/);
});

test("/admin: landing → first Read and → paid, median and 75th percentile, and the Reads' build time", async ({ page }) => {
  test.setTimeout(120_000);
  await q("delete from terminal.events where visitor_id = 'e2e-speed-v'");
  await q(`insert into terminal.events (name, visitor_id, at) values ('landing_view', 'e2e-speed-v', now() - interval '10 minutes'), ('read', 'e2e-speed-v', now() - interval '9 minutes')`);
  for (let i = 0; i < 3; i++) {
    const step = stepAt(Date.now());
    await page.goto("/admin");
    await page.getByLabel("Admin token").fill(SERVER_ENV.ADMIN_TOKEN!);
    await page.getByLabel("Authenticator code").fill(totpCode(base32Decode(SERVER_ENV.ADMIN_TOTP_SECRET!)!, step));
    await page.getByRole("button", { name: "Sign in" }).click();
    if (await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 5_000 }).then(() => true, () => false)) break;
    while (stepAt(Date.now()) <= step) await page.waitForTimeout(1000);
  }
  const speed = page.getByTestId("admin-speed");
  await expect(speed.getByTestId("speed-read").locator("th")).toHaveText("Landing → first Read");
  expect(Number(await speed.getByTestId("speed-read").locator("td").first().innerText())).toBeGreaterThanOrEqual(1);
  await expect(speed.getByTestId("speed-paid").locator("th")).toHaveText("Landing → paid");
  await expect(speed.getByTestId("speed-reads")).toContainText(/\d+ Reads · median build \d+ ms/);
  await expect(page.getByTestId("admin-cancels")).toBeVisible();
  await expect(page.getByTestId("admin-posts")).toContainText("Per post");
  await expect(page.getByTestId("admin-retention").getByTestId("after-trial")).toContainText(`Paid on day ${TRIAL.days + 1}:`);
  await expect(page.getByTestId("admin-retention").getByTestId("churn30")).toContainText("30-day churn:");
  await q("delete from terminal.events where visitor_id = 'e2e-speed-v'");
});

test("/status shows the money-path check: its steps when it passes, and the step and reason when it fails", async ({ page }) => {
  await q("delete from terminal.monitor_runs");
  await q(`insert into terminal.monitor_runs (at, ok, failed_step, detail, ms, steps) values (now() - interval '20 minutes', true, null, null, 1800,
    '[{"step":"landing","ok":true,"ms":120},{"step":"read","ok":true,"ms":900},{"step":"checkout","ok":true,"ms":300},{"step":"sign-in","ok":true,"ms":480}]')`);
  await page.goto("/status");
  const mp = page.getByTestId("status-money-path");
  await expect(mp).toContainText("Landing → Read → checkout → Whop sign-in");
  await expect(mp).toContainText("Every step passed");
  await q(`insert into terminal.monitor_runs (at, ok, failed_step, detail, ms, steps) values (now() - interval '5 minutes', false, 'sign-in', 'Whop said "redirect_uri is invalid" (https://insidir.com/reset/callback)', 2100,
    '[{"step":"landing","ok":true,"ms":120},{"step":"read","ok":true,"ms":900},{"step":"checkout","ok":true,"ms":300},{"step":"sign-in","ok":false,"ms":780,"detail":"Whop said \\"redirect_uri is invalid\\" (https://insidir.com/reset/callback)"}]')`);
  await page.reload();
  await expect(mp).toContainText('Failed');
  await expect(mp).toContainText('at sign-in: Whop said "redirect_uri is invalid"');
  await expect(page.getByTestId("status-incidents")).toContainText("Money path failed at sign-in");
  await page.screenshot({ path: shotName("status-money-path", page), fullPage: true });
  await q("delete from terminal.monitor_runs");
});

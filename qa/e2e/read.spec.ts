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

async function readFrom(page: Page, text: string) {
  await page.getByTestId("read-input").fill(text);
  const t0 = Date.now();
  await page.getByTestId("read-go").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-card")).toBeVisible();
  return Date.now() - t0;
}

test("a visitor's one Read (US rule), blurred bets and line never sent, Share, then pay first and back on the same Read as a member", async ({ page }) => {
  test.setTimeout(90_000);
  const w = page.viewportSize()!.width;
  const email = `reader-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/");
  const ms = await readFrom(page, "Tennis match 100");
  expect(ms).toBeLessThan(5_000);
  const url = page.url();
  const id = url.split("/read/")[1]!;
  const card = page.getByTestId("read-card");
  await expect(card.getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  // Proven money: E2E-Follow's $90K, all on Player A.
  await expect(page.getByTestId("read-proven")).toContainText("Player A100% · $90K · 1 position");
  // From both sources: the Tennis tracker (32 settled, a positive return) and E2E-Follow, shown to visitors as a count.
  await expect(page.getByTestId("proven-tracker")).toHaveText(/^Tennis · \+\d+\.\d% over 32 settled · on Player APlayer A: \$90K in 1 position$/);
  await expect(page.getByTestId("read-wallets-locked")).toHaveText("1 proven wallet in it. Members see each one's side, dollars and record.");
  await expect(page.getByTestId("read-proven-def")).toContainText("30+ closed Polymarket markets and positive all-time profit");
  // The US rule: Kalshi only. Player A is Kalshi's NO (the pair is inverted): 60¢; the other side 40¢.
  await expect(page.getByTestId("read-prices").locator("thead th")).toHaveText(["Side", "Kalshi"]);
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢"]);
  await expect(page.getByTestId("price-polymarket")).toHaveCount(0);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Kalshi");
  await expect(page.getByTestId("read-open")).toHaveAttribute("href", "https://kalshi.com/markets/e2e/KXE2ETENNIS-100");
  await expect(page.locator('a[href*="polymarket.com"]')).toHaveCount(0);
  // The bets and the line: blurred, and not in the page at all.
  await expect(page.getByTestId("read-locked")).toContainText("1 big bet in the last 24 hours, and the analyst line");
  await expect(page.getByTestId("read-bets")).toHaveCount(0);
  await expect(page.getByTestId("read-line")).toHaveCount(0);
  const html = await (await page.request.get(url)).text();
  expect(html).not.toMatch(/\$90K on Player A|0xe2…dd|Analyst line<\/h2><p class="rline"/);
  await page.screenshot({ path: shotName("read-visitor", page), fullPage: true });
  // Share: the image, 1080×1350, insidir.com on it.
  const img = await page.request.get(`/read/${id}/image`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  const png = await img.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  // A second Read: Start for $1.
  await page.goto("/");
  await page.getByTestId("read-input").fill("Tennis match 101");
  await page.getByTestId("read-go").click();
  const err = page.getByTestId("read-box").getByRole("alert");
  await expect(err).toContainText("You've used your free Read. Members read every market.");
  await expect(err.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", "/start");
  // From the blurred part: pay first (no sign-in), Whop sign-in, and back on this Read as a member.
  await page.goto(url);
  await page.getByTestId("read-locked").getByRole("link", { name: "Start for $1" }).click();
  await expect(page).toHaveURL(new RegExp(`/start\\?next=%2Fread%2F${id}$`));
  await expect(page.getByTestId("start-pay-first")).toContainText("then you're back on your Read");
  await post("/__whop_user", { email, name: null });
  await page.getByTestId("age-18").getByRole("checkbox").check();
  const form = page.locator("[data-mock-checkout]");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  // One question first: what do you bet on? Then back on their Read.
  await expect(page.getByRole("heading", { level: 1, name: "What do you bet on?" })).toBeVisible({ timeout: 25_000 });
  for (const l of ["NFL", "NBA", "CFB", "NHL", "MLB", "Soccer", "Elections", "Other"]) await expect(page.getByTestId("onboarding").getByText(l, { exact: true })).toBeVisible();
  await page.getByTestId("onboarding").getByText("NFL", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(url, { timeout: 15_000 });
  expect((await q<{ bet: string[] }>("select settings->'betOn' as bet from terminal.users where email = $1", [email]))[0]!.bet).toEqual(["nfl"]);
  await expect(page.getByTestId("read-bets")).toContainText("$90K on Player A at 52¢");
  await expect(page.getByTestId("read-bets")).toContainText("Polymarket · 0xe2…dd");
  // Members see the proven wallet: its side, dollars and followable record (no public Polymarket record in the fixtures).
  await expect(page.getByTestId("proven-wallet")).toHaveText(/^0xe2…dd · \$90K on Player A\+\d+\.\d% followed over 32 settled$/);
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  expect(await page.getByTestId("read-line").innerText()).not.toMatch(/guarantee|should|insider/i);
  await expect(page.getByTestId("read-locked")).toHaveCount(0);
  await expect(page.getByTestId("read-advice")).toHaveText("Information, not financial or betting advice. Public data from Polymarket and Kalshi.");
  await page.screenshot({ path: shotName("read-after-pay", page), fullPage: true });
  // Their home: tonight's NFL game (ready to read), this market in Your markets, and the week.
  await page.goto("/");
  await expect(page.getByTestId("tonight")).toContainText("E2E fixture: Jets vs. Dolphins");
  await expect(page.getByTestId("tonight")).toContainText("NFL ·");
  await expect(page.getByTestId("your-markets").locator("a").first()).toContainText("E2E fixture: Tennis match 100");
  await expect(page.getByTestId("your-markets")).toContainText("Proven money 100% Player A");
  await expect(page.getByTestId("week-recap")).toContainText("Your markets this week");
  await page.screenshot({ path: shotName("member-home-tonight", page), fullPage: true });
  // A tonight market opens its Read in one tap.
  await page.getByTestId("tonight").getByRole("button").first().click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-card").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Jets vs. Dolphins");
});

test("a member outside the US: \"tennis\" reads the main market, both venues with the better price marked, Open on it; on their home page after", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/");
  // Tennis match 100 is the main tennis market: paired with Kalshi and the most tracked money ($90K against $60K, $45K).
  await readFrom(page, "tennis");
  await expect(page.getByTestId("read-card").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  await expect(page.getByTestId("read-prices").locator("thead th")).toHaveText(["Side", "Kalshi", "Polymarket"]);
  // Player A: Kalshi 60¢, Polymarket 58¢ (better); the other side: Kalshi 40¢ (better), Polymarket 42¢.
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢Best"]);
  await expect(page.getByTestId("price-polymarket")).toHaveText(["58¢Best", "42¢"]);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Polymarket");
  await expect(page.getByTestId("read-bets")).toBeVisible();
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  await page.screenshot({ path: shotName("read-member-intl", page), fullPage: true });
  await page.goto("/");
  await expect(page.getByTestId("your-markets").locator("a").first()).toContainText("E2E fixture: Tennis match 100");
});

test("free Read: picking from \"Which one?\" doesn't use it up, nor does a Read with no money; home offers tonight's markets in one tap", async ({ page }) => {
  test.setTimeout(60_000);
  await q("delete from terminal.markets where id = '0xe2equiet'");
  await q(`insert into terminal.markets (venue, id, data) values ('polymarket', '0xe2equiet', $1)`, [JSON.stringify({ venue: "polymarket", id: "0xe2equiet", title: "E2E fixture: Quiet market", eventTitle: null, yesLabel: "Yes", noLabel: "No", url: "https://polymarket.com/event/e2e-quiet", yesPrice: 0.5, volume24h: 1000, active: true, result: null, closeTime: Date.now() + 30 * 86_400_000 })]);
  try {
    // A Read with no proven money and no big bets: it says so, and it isn't the free Read.
    await page.goto("/");
    await readFrom(page, "Quiet market");
    await expect(page.getByTestId("read-proven-none")).toContainText("No proven money holds a position here right now.");
    await expect(page.getByTestId("read-proven-none")).toContainText("No tracked large positions here either.");
    // Two markets fit equally ($45K and $60K: no clear leader): "Which one?". Picking one opens it...
    await page.goto("/");
    await page.getByTestId("read-input").fill("Tennis match 101 102");
    await page.getByTestId("read-go").click();
    const choices = page.getByTestId("read-choices").locator("button");
    await expect(choices).toHaveCount(2);
    await page.screenshot({ path: shotName("read-choices", page), fullPage: true });
    await choices.filter({ hasText: "Tennis match 102" }).click();
    await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
    await expect(page.getByTestId("read-card").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 102");
    // ...and the other one is still a tap away under it, without a second free Read.
    const others = page.getByTestId("read-others");
    await expect(others).toContainText("Not this one? Your other matches");
    await others.getByRole("button").filter({ hasText: "Tennis match 101" }).click();
    await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
    await expect(page.getByTestId("read-card").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 101");
    // A new search is a new Read: that one asks for $1.
    await page.goto("/");
    await page.getByTestId("read-input").fill("Tennis match 100");
    await page.getByTestId("read-go").click();
    await expect(page.getByTestId("read-box").getByRole("alert")).toContainText("You've used your free Read.");
  } finally {
    await q("delete from terminal.markets where id = '0xe2equiet'");
  }
});

test("home: under the box, one-tap Reads for tonight's busiest markets with proven money", async ({ page }) => {
  await page.goto("/");
  const taps = page.getByTestId("tonight-reads");
  await expect(taps.getByRole("heading")).toHaveText("Tonight, with proven money");
  // Tennis match 100 starts tonight and has proven money; tonight's NFL game has big money but none of it proven.
  await expect(taps.getByRole("button")).toHaveCount(1);
  await expect(taps.getByRole("button")).toContainText(/E2E fixture: Tennis match 100.*\$90K proven in 1 position/);
  await page.screenshot({ path: shotName("home-tonight-taps", page), fullPage: false });
  await taps.getByRole("button").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-card").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
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
  await expect(page.getByTestId("admin-retention").getByTestId("day8")).toContainText("Paid on day 8:");
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

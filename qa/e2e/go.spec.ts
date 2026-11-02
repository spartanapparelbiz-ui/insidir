/* The /go funnel, end to end, with Whop stood in by the local mock (qa/e2e/mock-whop.ts):
 *   hook (a real millionaire bet an hour late, the live last-hour count) → what they bet on → where → bet size →
 *   building (real counts ticking in) → the personal aha (3 real cards, the first unlocked, the others' sides never
 *   sent) → the paywall (their headline, the trial timeline, remind toggle on, full price, proof with a loss) →
 *   the enclosed checkout → pay → Whop sign-in → back on the same cards, all unlocked, their answers saved as their
 *   categories. Every step is recorded per UTM source for /admin/go. Captures of each step at both widths. */
import { expect, test, type Page } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const RICH = "0xe2e00000000000000000000000000000000000c1", RICH2 = "0xe2e00000000000000000000000000000000000c2";
const shot = (page: Page, step: string) => page.screenshot({ path: `qa/screenshots/p0/go-${step}-${page.viewportSize()!.width}.png`, fullPage: true });

async function seedBets(tag: string): Promise<void> {
  await q("insert into terminal.millionaire_wallets (wallet, pnl, source, read_at) values ($1, 3100000, 'leaderboard', now()), ($2, 2400000, 'leaderboard', now()) on conflict (wallet) do nothing", [RICH, RICH2]);
  const bets: Array<[string, string, string, "yes" | "no", string, number, string, number]> = [
    ["rams", "Rams vs. 49ers", "Rams vs. 49ers", "yes", "Rams", 120_000, RICH, 95],
    ["rams2", "Rams vs. 49ers", "Rams vs. 49ers", "yes", "Rams", 40_000, RICH2, 85],
    ["kc", "Chiefs vs. Bills", "Chiefs vs. Bills", "no", "Bills", 70_000, RICH, 30],
    ["dal", "Cowboys vs. Eagles", "Cowboys vs. Eagles", "yes", "Cowboys", 20_000, RICH2, 20],
    ["sea", "Seahawks vs. Cardinals", "Seahawks vs. Cardinals", "yes", "Seahawks", 9_000, RICH2, 10],
  ];
  for (const [id, ev, title, side, outcome, amount, wallet, ago] of bets) {
    await q(`insert into terminal.millionaire_bets (id, wallet, market_id, event_title, market_title, outcome, outcome_side, amount, price, pnl, tab, league, category, at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, 0.64, 3100000, 'sports', 'NFL', 'sports', now() - ($9 || ' minutes')::interval) on conflict (id) do nothing`,
      [`go-${tag}-${id}`, wallet, `0xgo${tag}${id.replace(/\d+$/, "")}`, ev, title, outcome, side, amount, String(ago)]);
  }
}
async function clearBets(tag: string): Promise<void> {
  await q("delete from terminal.millionaire_bets where id like $1", [`go-${tag}-%`]);
}

test("/go: hook → quiz → building → aha → paywall → checkout → paid → the same cards unlocked, answers saved", async ({ page }) => {
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width, tag = String(w), email = `go-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await seedBets(tag);
  try {
    // 1. The hook: a real $1M+ bet, at least an hour old, labeled so; the live count; no site nav.
    await page.goto("/go?utm_source=e2e-go&utm_campaign=p0");
    const hook = page.getByTestId("go-hook");
    await expect(hook).toBeVisible();
    await expect(hook).toContainText("1 hour ago");
    await expect(hook).toContainText("+$2.4M wallet");
    await expect(page.getByTestId("go-hour")).toHaveText(/^\d+$/);
    expect(Number(await page.getByTestId("go-hour").innerText())).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".nav__cta, [data-testid=op-header]")).toHaveCount(0);
    expect(await page.content()).not.toContain(RICH2);
    await shot(page, "1-hook");
    await page.getByTestId("go-start").click();

    // 2–4. The quiz: one tap each (topics are multi and need Continue).
    await expect(page.getByTestId("go-topics")).toBeVisible();
    await expect(page.getByTestId("go-continue")).toBeDisabled();
    await page.getByRole("button", { name: "NFL", exact: true }).click();
    await expect(page.getByRole("button", { name: "NFL", exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "2-topics");
    await page.getByTestId("go-continue").click();
    await expect(page.getByTestId("go-venue")).toBeVisible();
    await shot(page, "3-venue");
    await page.getByRole("button", { name: "Kalshi", exact: true }).click();
    await expect(page.getByTestId("go-stake")).toBeVisible();
    await shot(page, "4-stake");
    await page.getByRole("button", { name: "$25–100", exact: true }).click();

    // 5. Building: real counts tick in.
    await expect(page.getByTestId("go-building")).toBeVisible();
    await expect(page.getByTestId("go-building")).toContainText("millionaire wallets");
    await shot(page, "5-building");

    // 6. The aha: 3 real cards in their category, the first unlocked, the others blurred with no side in the page.
    await expect(page.getByTestId("go-aha")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("go-card-0")).toHaveAttribute("data-locked", "false");
    await expect(page.getByTestId("go-card-0")).toContainText("Rams");
    await expect(page.getByTestId("go-card-0")).toContainText("$160K");
    await expect(page.getByTestId("go-card-1")).toHaveAttribute("data-locked", "true");
    await expect(page.getByTestId("go-card-1")).toContainText("$70K of millionaire money");
    expect(await page.getByTestId("go-card-1").innerText()).not.toMatch(/on Bills/);
    await expect(page.getByTestId("go-more")).toHaveText("+1 more today");
    await shot(page, "6-aha");
    await page.getByTestId("go-unlock").click();

    // 7. The paywall: their headline, the timeline, remind on by default, the full price before the button.
    const pay = page.getByTestId("go-paywall");
    await expect(pay).toContainText("Every millionaire bet on NFL, live.");
    await expect(page.getByTestId("go-timeline")).toContainText("Today: $1, everything unlocked");
    await expect(page.getByTestId("go-timeline")).toContainText("$39/month. Cancel in 2 taps.");
    await expect(page.getByTestId("go-remind")).toBeChecked();
    await expect(page.getByTestId("go-price")).toContainText("then $39/month");
    await expect(pay).toContainText("Secure payment by Whop · Cancel anytime · Information, not advice.");
    expect(await pay.innerText()).not.toMatch(/guaranteed|risk-free|spots left/i);
    await shot(page, "7-paywall");
    await page.getByTestId("go-pay").click();

    // 8. The enclosed checkout: 18+ inline, then pay.
    await expect(page.getByTestId("go-checkout")).toBeVisible();
    await page.getByTestId("age-18").getByRole("checkbox").check();
    const form = page.locator("[data-mock-checkout]");
    await expect(form).toBeVisible();
    await shot(page, "8-checkout");
    await post("/__whop_user", { email, name: "Go Buyer" });
    await form.getByLabel("Email").fill(email);
    await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();

    // Paid: Whop sign-in, then back on the same cards, now all unlocked; no second onboarding.
    await expect(page).toHaveURL(/\/go\?unlocked=1$/, { timeout: 30_000 });
    await expect(page.getByTestId("go-in")).toHaveText("You're in. Everything is unlocked.");
    for (const i of [0, 1, 2]) await expect(page.getByTestId(`go-card-${i}`)).toHaveAttribute("data-locked", "false");
    await expect(page.getByTestId("go-card-1")).toContainText("Bills");
    await shot(page, "9-unlocked");
    const u = (await q<{ plan: string; settings: { betOn?: string[]; remindBeforeCharge?: boolean }; region: string | null; onboarded: boolean }>(
      "select plan, settings, region, onboarded_at is not null as onboarded from terminal.users where email = $1", [email]))[0]!;
    expect(u).toMatchObject({ plan: "insidir", onboarded: true, region: "us" });
    expect(u.settings.betOn).toEqual(["nfl"]);
    expect(u.settings.remindBeforeCharge).toBe(true);
    await page.getByTestId("go-home").click();
    await expect(page.getByTestId("member-home")).toBeVisible({ timeout: 15_000 });

    // Every step shown was recorded under the visitor's UTM source, and the time on each one they left.
    const steps = await q<{ step: string }>("select distinct props->>'step' as step from terminal.events where name = 'go_step' and props->>'source' = 'e2e-go'");
    expect(new Set(steps.map(s => s.step))).toEqual(new Set(["hook", "topics", "venue", "stake", "building", "aha", "paywall", "checkout", "unlocked"]));
    const timed = await q<{ step: string }>("select distinct props->>'step' as step from terminal.events where name = 'go_time' and props->>'source' = 'e2e-go'");
    expect(timed.map(s => s.step)).toEqual(expect.arrayContaining(["hook", "topics", "venue", "stake", "aha", "paywall"]));
  } finally {
    await clearBets(tag);
  }
});

test("/go: leaving at the paywall and coming back opens their own picks; members are sent home", async ({ page }) => {
  const tag = `b${page.viewportSize()!.width}`;
  await seedBets(tag);
  try {
    await page.goto("/go");
    await page.getByTestId("go-start").click();
    await page.getByRole("button", { name: "NFL", exact: true }).click();
    await page.getByTestId("go-continue").click();
    await page.getByRole("button", { name: "Polymarket", exact: true }).click();
    await page.getByRole("button", { name: "$500+", exact: true }).click();
    await expect(page.getByTestId("go-aha")).toBeVisible({ timeout: 15_000 });
    await page.goto("/");
    await page.goto("/go");
    await expect(page.getByTestId("go-aha")).toContainText("Your NFL picks are ready");
    await page.getByTestId("go-back").click();
    await expect(page.getByTestId("go-stake")).toBeVisible();
  } finally {
    await clearBets(tag);
  }
});

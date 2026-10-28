/* The whole member journey, as one person: visitor → paid → follow → alerts → cancel (docs/INSIDIR-V2.md).
 *   A visitor lands, taps "Try 7 days for $1", chooses an email and password and pays in the checkout embedded
 *   on /start (the local mock),
 *   comes back signed in to the live feed with the one-time welcome, follows a top trader, sets up alerts (push on
 *   this device, a real test alert delivered to the stand-in push service, the alert history), then sees the next
 *   charge in Billing and cancels in one tap. Run at both sizes; it resets everything it creates. */
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { APP_URL, OUT, PUSH_PORT, WHOP_PORT } from "./env";
import { q } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const pushes = () => JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string }>;
const toast = (page: Page, text: string | RegExp) => page.locator(".uitoast").filter({ hasText: text });

const EMAIL = (w: number) => `journey-${w}@example.test`;
const MOCK_USER = { sub: "" };
async function reset(email: string) {
  MOCK_USER.sub = (await q<{ id: string }>("select id from terminal.users where email = $1", [email]))[0]?.id ?? "none";
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.push_subscriptions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.alerts_sent where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.follows where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.sessions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.users where id = $1", [MOCK_USER.sub]);
}

test("visitor → paid → alerts → cancel", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width;
  await reset(EMAIL(w));
  const shot = (name: string) => page.screenshot({ path: `qa/screenshots/ux-after/agent-b/journey-${name}-${w}.png` });

  // A stand-in for the browser's push subscription (its endpoint is our local push service), as in push.spec.ts.
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const endpoint = `https://localhost:${PUSH_PORT}/push/journey-${w}`;
  await context.grantPermissions(["notifications"], { origin: APP_URL });
  await context.addInitScript(({ endpoint, p256dh, auth }) => {
    const fake = { endpoint, expirationTime: null, options: {}, getKey: () => null, toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }), unsubscribe: async () => true };
    let current: typeof fake | null = null;
    PushManager.prototype.subscribe = async function () { current = fake; return fake as unknown as PushSubscription; };
    PushManager.prototype.getSubscription = async function () { return current as unknown as PushSubscription | null; };
  }, { endpoint, p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") });

  try {
    // A visitor: the landing page, then "Try 7 days for $1" → the embedded checkout → pay → logged in, welcome.
    await page.goto("/");
    await page.locator('[data-cta="hero"]').click();
    await expect(page).toHaveURL(/\/start$/);
    await page.locator("#start-email").fill(EMAIL(w));
    await page.locator("#start-password").fill("journey-password");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.getByRole("button", { name: "Pay $1 (test mode)" }).click();
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
    MOCK_USER.sub = (await q<{ id: string }>("select id from terminal.users where email = $1", [EMAIL(w)]))[0]!.id;

    // Onboarding: 1. pick Sports → NFL (big tap tiles); 2. top traders from those picks, 3 ticked; 3. the phone steps.
    await expect(page.getByRole("heading", { name: "What do you want to follow?" })).toBeVisible();
    await shot("onboarding-1");
    await page.getByRole("button", { name: /^Sports/ }).click();
    await page.getByRole("button", { name: "NFL", exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Follow 3 top traders" })).toBeVisible();
    const boxes = page.locator(".first__trader input");
    await expect(boxes.first()).toBeVisible();
    const shown = await boxes.count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(5);
    await expect(page.locator(".first__trader input:checked")).toHaveCount(Math.min(3, shown));
    await expect(page.locator(".first__trec").first()).toContainText(/Won \d+ of \d+/);
    await shot("onboarding-2");
    await page.getByRole("button", { name: /^Follow \d/ }).click();
    await expect(page.getByRole("heading", { name: "Get it on your phone" })).toBeVisible();
    await expect(page.getByText("Add to Home Screen")).toBeVisible();
    await shot("onboarding-3");
    await page.getByRole("button", { name: "Done" }).click();
    // The feed, filtered to their picks, with the one-time hint on the first card.
    await expect(page).toHaveURL(/\/feed\?first=1/);
    await expect(page.getByRole("button", { name: "Your picks" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("first-hint")).toContainText("This is a big move. Tap anyone to see their record.");
    await shot("feed-first");
    const settings = (await q<{ settings: { picks?: { tabs: string[]; leagues: string[] } } }>("select settings from terminal.users where id = $1", [MOCK_USER.sub]))[0]!.settings;
    expect(settings.picks).toMatchObject({ tabs: ["sports"], leagues: ["NFL"] });
    await expect.poll(async () => (await q<{ n: number }>("select count(*)::int as n from terminal.follows where user_id = $1 and kind = 'trader'", [MOCK_USER.sub]))[0]?.n).toBe(Math.min(3, shown));
    // Once only: the hint doesn't come back.
    await page.goto("/feed?first=1");
    await expect(page.locator(".move").first()).toBeVisible();
    await expect(page.getByTestId("first-hint")).toHaveCount(0);
    await page.goto("/following");
    await expect(page.getByText("E2E-Top").first()).toBeVisible();

    // Alerts: push on this device, a real test alert, then the history.
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible();
    await expect(page.getByText("Every move by a trader you follow.")).toBeVisible();
    await page.getByRole("button", { name: "Turn on alerts" }).click();
    await expect(toast(page, "Alerts on")).toBeVisible();
    const before = pushes().length;
    await page.getByRole("button", { name: "Send test alert" }).click();
    await expect(toast(page, "Test alert sent to 1 device")).toBeVisible();
    expect(pushes().slice(before).some(p => endpoint.endsWith(p.path))).toBe(true);

    await expect(page.getByText("No alerts yet. When someone you follow moves, it shows up here.")).toBeVisible();
    await q("insert into terminal.alerts_sent (user_id, opp_id, channel) values ($1, 'move:e2e:m1', 'push') on conflict do nothing", [MOCK_USER.sub]);
    await page.reload();
    await expect(page.locator(".atable").getByText("$412,000 on Chiefs to win")).toBeVisible();
    await shot("alerts");

    // Billing: the next charge, then cancel in one tap.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    // Access started with the $1: the account shows when the $39 starts.
    await expect(page.getByText("Your $1 week ends")).toBeVisible();
    await expect(page.getByText("then $39.00 / month unless you cancel")).toBeVisible();
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(toast(page, "Subscription cancelled.")).toBeVisible();
    await expect(page.getByTestId("cancels-on")).toContainText("Cancels on");
    await shot("billing");
    const st = await (await whop("/__state")).json() as { memberships: Array<{ cancel_at_period_end: boolean }> };
    expect(st.memberships[0]?.cancel_at_period_end).toBe(true);
  } finally {
    await reset(EMAIL(w));
  }
});

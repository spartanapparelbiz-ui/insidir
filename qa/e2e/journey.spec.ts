/* The whole member journey, as one person: free → paid → follow → alerts → cancel (docs/INSIDIR-V2.md).
 *   A visitor lands, opens the free feed (30 minutes late), taps "Try it for $1", pays on Whop (the local mock),
 *   comes back signed in to the live feed with the one-time welcome, follows a top trader, sets up alerts (push on
 *   this device, a real test alert delivered to the stand-in push service, the alert history), then sees the next
 *   charge in Billing and cancels in one tap. Run at both sizes; it resets everything it creates. */
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { APP_URL, OUT, PUSH_PORT, WHOP_PORT } from "./env";
import { q } from "./helpers";
import { MOCK_USER } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const pushes = () => JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string }>;
const toast = (page: Page, text: string | RegExp) => page.locator(".uitoast").filter({ hasText: text });

async function reset() {
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.push_subscriptions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.alerts_sent where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.follows where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.sessions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.users where id = $1", [MOCK_USER.sub]);
}

test("free → paid → alerts → cancel", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  test.setTimeout(120_000);
  await reset();
  const w = page.viewportSize()!.width;
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
    // Free: the landing page, then the feed without an account (30 minutes late).
    await page.goto("/");
    await page.getByRole("link", { name: "See the live feed" }).first().click();
    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByText("You're seeing moves 30 minutes late.")).toBeVisible();

    // Paid: "Try it for $1" → Whop checkout → pay → back signed in on the live feed.
    await page.locator("[data-unlock]").first().click();
    await expect(page).toHaveURL(new RegExp(`localhost:${WHOP_PORT}/checkout/plan_e2e_`));
    await page.getByRole("button", { name: "Pay (test mode)" }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 20_000 });

    // The welcome: follow the first top trader in one tap; it shows on Following.
    const welcome = page.locator(".welcome");
    await expect(welcome.getByRole("heading", { name: "You're in. Follow your first 3 top traders." })).toBeVisible();
    await welcome.getByRole("button", { name: "Follow" }).first().click();
    await expect(welcome.getByRole("button", { name: "Following" }).first()).toBeVisible();
    await shot("welcome");
    await expect.poll(async () => (await q<{ n: number }>("select count(*)::int as n from terminal.follows where user_id = $1 and kind = 'trader'", [MOCK_USER.sub]))[0]?.n).toBe(1);
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
    // Insidir, not Pro: custom rules point to Pro.
    await expect(page.locator("[data-unlock=rules]")).toHaveText("Go Pro");
    await shot("alerts");

    // Billing: the next charge, then cancel in one tap.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await expect(page.getByText("Next charge")).toBeVisible();
    await expect(page.getByText("$39.00 / month")).toBeVisible();
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(toast(page, "Subscription cancelled.")).toBeVisible();
    await expect(page.getByTestId("cancels-on")).toContainText("Cancels on");
    await shot("billing");
    const st = await (await whop("/__state")).json() as { memberships: Array<{ cancel_at_period_end: boolean }> };
    expect(st.memberships[0]?.cancel_at_period_end).toBe(true);
  } finally {
    await reset();
  }
});

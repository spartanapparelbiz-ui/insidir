/* The whole member journey, as one person: free → paid → alerts → cancel.
 *   A visitor lands, opens the free Terminal, taps Unlock, pays on Whop (the local mock), comes back signed in to the
 *   live Terminal, goes through the 3-step onboarding, sets up alerts (an autosaved change, push on this device,
 *   a real test alert delivered to the stand-in push service, the alert history), then sees the next charge in
 *   Billing and cancels in one tap. Run at both sizes; it resets everything it creates. */
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { APP_URL, OUT, PUSH_PORT, WHOP_PORT } from "./env";
import { dealId, q } from "./helpers";
import { MOCK_USER } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const pushes = () => JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string }>;
const toast = (page: Page, text: string | RegExp) => page.locator(".uitoast").filter({ hasText: text });

async function reset() {
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.push_subscriptions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.alerts_sent where user_id = $1", [MOCK_USER.sub]);
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
    // Free: the landing page, then the Terminal without an account.
    await page.goto("/");
    await page.getByRole("link", { name: "See today's live deals" }).first().click();
    await expect(page).toHaveURL(/\/terminal/);

    // Paid: Unlock → Whop checkout → pay → back signed in.
    await page.locator("[data-unlock]").first().click();
    await expect(page).toHaveURL(new RegExp(`localhost:${WHOP_PORT}/checkout/plan_e2e_`));
    await page.getByRole("button", { name: "Pay (test mode)" }).click();
    await expect(page).toHaveURL(/\/terminal/, { timeout: 20_000 });

    // Onboarding: three steps, shown once.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "What do you trade?" })).toBeVisible();
    await expect(dialog.getByText("Step 1 of 3")).toBeVisible();
    await dialog.getByText("Sports", { exact: true }).click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByRole("heading", { name: "Turn on alerts" })).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByRole("heading", { name: "You're set" })).toBeVisible();
    await shot("onboarding");
    await dialog.getByRole("button", { name: "See today's live deals" }).click();
    // Onboarding closes (the first-time tips may open next: that's their cue).
    await expect(page.getByRole("heading", { name: "You're set" })).toHaveCount(0);
    // The last step's button navigates to the Terminal; load it fresh rather than racing that navigation.
    await page.waitForURL(/\/terminal/);
    await page.goto("/terminal");
    await expect(page.getByRole("heading", { name: "What do you trade?" })).toHaveCount(0);
    const saved = await q<{ settings: { categories: string[] }; onboarded_at: Date | null }>("select settings, onboarded_at from terminal.users where id = $1", [MOCK_USER.sub]);
    expect(saved[0]?.settings.categories).toEqual(["sports"]);
    expect(saved[0]?.onboarded_at).not.toBeNull();

    // Alerts: an autosaved change, push on this device, a real test alert, then the history.
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible();
    const roi = page.getByLabel("Lowest return");
    await roi.fill("abc");
    await expect(page.getByText("Enter a number from 0 to 100")).toBeVisible();
    await roi.fill("2.5");
    await expect(toast(page, "Saved")).toBeVisible();
    await expect.poll(async () => (await q<{ r: number }>("select (settings->>'alertMinRoi')::float8 as r from terminal.users where id = $1", [MOCK_USER.sub]))[0]?.r).toBeCloseTo(0.025, 5);

    await page.getByRole("button", { name: "Turn on alerts" }).click();
    await expect(toast(page, "Alerts on")).toBeVisible();
    const before = pushes().length;
    await page.getByRole("button", { name: "Send test alert" }).click();
    await expect(toast(page, "Test alert sent to 1 device")).toBeVisible();
    expect(pushes().slice(before).some(p => endpoint.endsWith(p.path))).toBe(true);

    await expect(page.getByText("No alerts yet. When a deal matches, it shows up here.")).toBeVisible();
    await q("insert into terminal.alerts_sent (user_id, opp_id, channel) values ($1, $2, 'push') on conflict do nothing", [MOCK_USER.sub, await dealId("Hawks")]);
    await page.reload();
    await expect(page.locator(".atable").getByText("Will the Hawks win")).toBeVisible();
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

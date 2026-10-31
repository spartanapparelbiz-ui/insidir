/* The money path, end to end, with Whop stood in by a local mock (qa/e2e/mock-whop.ts):
 *   home → pricing → /start: one "Continue" → Whop's sign-in (mocked OAuth: our login app, /reset/callback, PKCE) →
 *   back on /start signed in, the embedded checkout open with their email → pay → "You're in" (onboarding) → the feed,
 *   a member by Whop's access check; the account linked to their Whop user. Sign out → the app is members only →
 *   /login: one "Continue" → back where they were going. Settings: "Manage subscription" goes to Whop's orders page.
 *   A refund ends access. A Whop account without Insidir is signed in and sent to /start.
 *   A buyer who paid signed out goes straight through Whop's sign-in and lands signed in. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";
import { whopUserFor } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("start → Continue (Whop sign-in) → pay → in → sign out → log in → Manage subscription → refund ends access", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `buyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  await page.goto("/pricing");
  await page.locator('[data-checkout="pricing"]').first().click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Follow the big money." })).toBeVisible();
  // Signed out: one button, and who handles sign-in and payment.
  const box = page.getByTestId("start-continue");
  await expect(box.getByRole("link")).toHaveCount(1);
  await expect(box.getByTestId("continue")).toHaveText("Continue");
  await expect(box).toContainText("Secure sign-in and payments by Whop.");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText(/continue with google/i)).toHaveCount(0);
  await page.screenshot({ path: `qa/screenshots/start-signed-out-${w}.png`, fullPage: true });

  // Whop's sign-in (mocked) signs them in and comes back to /start.
  await post("/__whop_user", { email, name: "Buyer Example" });
  await box.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/start$/, { timeout: 15_000 });
  await expect(page.getByTestId("start-signed-in")).toContainText(email);
  const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  await expect(page.getByTestId("charge-line")).toHaveText(`$1 today. $39 on ${due} unless you cancel.`);
  const made = (await q<{ id: string; plan: string; whop_user_id: string; name: string }>("select id, plan, whop_user_id, name from terminal.users where email = $1", [email]))[0]!;
  expect(made).toMatchObject({ plan: "free", whop_user_id: whopUserFor(email), name: "Buyer Example" });

  // The embedded checkout, their email filled in and locked; it carries our account id.
  const form = page.locator("[data-mock-checkout]");
  await expect(form.getByLabel("Email")).toHaveValue(email);
  await expect(form.getByLabel("Email")).not.toBeEditable();
  await page.screenshot({ path: `qa/screenshots/checkout-${w}.png`, fullPage: true });
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();

  // In the moment Whop says so: onboarding, then the feed.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/open$/);
  expect((await q<{ plan: string }>("select plan from terminal.users where id = $1", [made.id]))[0]!.plan).toBe("insidir");
  const state = await (await whop("/__state")).json() as { payments: Array<{ metadata: Record<string, string> }> };
  expect(state.payments.at(-1)!.metadata).toEqual({ insidir_user_id: made.id });
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${w}.png` });

  // Manage subscription: Whop's orders page; no cancel button of our own.
  await page.goto("/settings");
  await expect(page.getByTestId("manage-subscription")).toHaveAttribute("href", "https://whop.com/@me/settings/orders");
  await expect(page.getByRole("button", { name: /cancel subscription/i })).toHaveCount(0);

  // Sign out: members only. /login has one Continue, and it comes back to where they were going.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/following");
  await expect(page).toHaveURL(/\/login\?next=%2Ffollowing/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByTestId("continue")).toHaveText("Continue");
  await expect(page.getByText("Secure sign-in and payments by Whop.")).toBeVisible();
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  await expect(page.getByText(/forgot password/i)).toHaveCount(0);
  await page.screenshot({ path: `qa/screenshots/login-${w}.png` });
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/following$/, { timeout: 15_000 });
  const cookie = (await page.context().cookies()).find(c => c.name === "insidir_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);
  // The same account, found by its Whop user.
  expect(await q("select id from terminal.users where whop_user_id = $1", [whopUserFor(email)])).toHaveLength(1);
  expect((await page.goto("/login/google"))?.status()).toBe(404);

  // A refund ends access: Whop's access check says no.
  await post("/__refund", { email });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]!.plan).toBe("free");
  await page.goto("/following");
  await expect(page).toHaveURL(/\/start$/);
});

test("a Whop account without Insidir: signed in, sent to /start with the checkout; a cancelled Whop sign-in goes back to /login", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `stranger-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");
  await post("/__whop_user", { email, name: null });
  await page.goto("/login?next=%2Ffeed");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/start$/, { timeout: 15_000 });
  await expect(page.getByTestId("start-signed-in")).toContainText(email);
  await expect(page.locator("[data-mock-checkout]")).toBeVisible();
  // Whop says the sign-in was cancelled: back to /login, nothing set.
  await page.context().clearCookies();
  await page.goto("/reset/callback?error=access_denied");
  await expect(page).toHaveURL(/\/login\?error=cancelled$/);
  await expect(page.getByRole("alert")).toHaveText("Sign-in was cancelled. Continue when you're ready.");
  // A forged callback (no state cookie): refused.
  await page.goto("/reset/callback?code=wcode_forged&state=abc");
  await expect(page).toHaveURL(/\/login\?error=expired$/);
});

test("paid signed out: straight through Whop's sign-in, landing signed in", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `outbuyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  // A payment made without our checkout (a Whop link): the webhook makes the account for their Whop user.
  await post("/__pay", { plan: "plan_e2e_insidir", email, metadata: {} });
  await expect.poll(async () => (await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]?.plan).toBe("insidir");
  await post("/__whop_user", { email, name: null });
  await page.goto("/welcome?status=succeeded");
  // /welcome sends them through Whop's sign-in and back; signed in and a member, on to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
});

/* The money path, end to end, with Whop stood in by a local mock (qa/e2e/mock-whop.ts):
 *   home → "Try 7 days for $1" → /start: just an email on top, the embedded checkout below → pay → "You're in." on
 *   the feed, logged in, the account linked to the Whop account that paid; log out → the app is members only → Log
 *   in → "Continue" (Whop's sign-in; our URLs never name it) → back on the feed; a Whop account without Insidir gets
 *   "No Insidir membership for <email>"; a refund ends access. No passwords anywhere. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";
import { whopUserFor } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("sign up on /start with an email → pay → You're in → log out → log in with Whop → no membership → refund ends access", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `buyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  await page.goto("/?utm_source=instagram&utm_campaign=e2e");
  await expect(page.locator("h1")).toBeVisible();
  await page.locator('[data-cta="hero"]').click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Try Insidir 7 days for $1." })).toBeVisible();
  await expect(page.getByText("Then $39/mo, cancel anytime.").first()).toBeVisible();
  // The charge date: 7 days from today.
  const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  await expect(page.getByTestId("charge-line")).toHaveText(`$1 today. $39 on ${due} unless you cancel.`);
  await expect(page.getByText("Cancel anytime in 2 clicks. Secure payment by Whop.")).toBeVisible();

  // Sign-up on top: just the email, no password.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.locator("#start-email").fill(email);
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // The checkout below, the email filled in and locked.
  const form = page.locator("[data-mock-checkout]");
  await expect(form.getByLabel("Email")).toHaveValue(email);
  await expect(form.getByLabel("Email")).not.toBeEditable();
  await page.screenshot({ path: `qa/screenshots/checkout-${w}.png`, fullPage: true });
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();

  // Logged in the moment the payment lands, straight into onboarding; skipping it opens the feed.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "What do you want to follow?" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/feed\?first=1/);
  const user = (await q<{ id: string; plan: string; whop_user_id: string }>("select id, plan, whop_user_id from terminal.users where email = $1", [email]))[0]!;
  expect(user).toMatchObject({ plan: "insidir", whop_user_id: whopUserFor(email) });
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${w}.png` });

  // Log out: members only. Log in is one button to Whop's sign-in, and back on the feed.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login\?next=%2Ffeed/);
  await expect(page.getByRole("heading", { name: "Log in to Insidir" })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText("Google, Apple or email · secure sign-in by Whop")).toBeVisible();
  const go = page.getByTestId("login-continue");
  await expect(go).toHaveText("Continue");
  await expect(go).toHaveAttribute("href", "/login/start");
  await page.screenshot({ path: `qa/screenshots/login-${w}.png` });
  // The Whop account they paid with (its email can differ from the one typed on /start).
  await post("/__oauth_user", { id: whopUserFor(email), email: `whop-${email}` });
  await go.click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
  const cookie = (await page.context().cookies()).find(c => c.name === "insidir_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // A Whop account that hasn't got Insidir: told so, with the trial and another account to try.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await post("/__oauth_user", { id: `user_stranger_${w}`, email: `stranger-${w}@example.test` });
  await page.goto("/login");
  await page.getByTestId("login-continue").click();
  await expect(page).toHaveURL(/\/login\?error=no_membership/);
  const none = page.getByTestId("no-membership");
  await expect(none.getByRole("heading")).toHaveText(`No Insidir membership for stranger-${w}@example.test`);
  await expect(none.getByRole("link", { name: "Try 7 days for $1" })).toHaveAttribute("href", "/start");
  await expect(none.getByRole("link", { name: "Use a different account" })).toHaveAttribute("href", "/login/start?fresh=1");
  await page.screenshot({ path: `qa/screenshots/login-no-membership-${w}.png` });
  await expect(page.locator("main")).not.toContainText(/password/i);
  await expect(page).not.toHaveURL(/whop/i);
  // The old password addresses are gone.
  expect((await page.goto("/reset"))?.status()).toBe(404);

  // "Use a different account": the buyer's own Whop account brings them back in.
  await post("/__oauth_user", { id: whopUserFor(email), email });
  await page.goto("/login?error=no_membership");
  await page.getByRole("link", { name: "Use a different account" }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });

  // A refund ends access; logging in again says so.
  await post("/__refund", { email });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]!.plan).toBe("free");
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/start$/);
});

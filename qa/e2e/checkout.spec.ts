/* The money path, end to end, with Whop stood in by a local mock (qa/e2e/mock-whop.ts):
 *   home → "Try 7 days for $1" → /start: email + password on top, the embedded checkout below → pay → "You're in."
 *   on the feed, logged in, the account made with that email and password; log out → the app is members only → log in
 *   with email and password (a wrong one is refused); "Forgot password?" says how to get it reset; a refund ends
 *   access. "Continue with Google" on /start: back with the checkout open on their Google email → pay → in; log out →
 *   "Continue with Google" on /login → the feed; a Google account without Insidir: "No Insidir membership for …".
 *   The word "Whop" never appears on any of these pages. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";
import { whopUserFor } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("sign up on /start with a password → pay → You're in → log out → log in → forgot password → refund ends access", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `buyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  await page.goto("/?utm_source=instagram&utm_campaign=e2e");
  await expect(page.locator("h1")).toBeVisible();
  await page.goto("/pricing");
  await page.locator('[data-checkout="pricing"]').first().click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Try Insidir 7 days for $1." })).toBeVisible();
  await expect(page.getByText("Then $39/mo, cancel anytime.").first()).toBeVisible();
  // The charge date: 7 days from today.
  const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  await expect(page.getByTestId("charge-line")).toHaveText(`$1 today. $39 on ${due} unless you cancel.`);
  await expect(page.getByText("Cancel anytime in 2 clicks. Secure checkout.")).toBeVisible();

  // Sign-up on top: a short password is refused before anything is sent.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.locator(".login__err")).toContainText("at least 8 characters");
  await page.getByLabel("Password", { exact: true }).fill("a-good-password");
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
  const user = (await q<{ id: string; plan: string; whop_user_id: string; password_hash: string }>("select id, plan, whop_user_id, password_hash from terminal.users where email = $1", [email]))[0]!;
  expect(user).toMatchObject({ plan: "insidir", whop_user_id: whopUserFor(email) });
  expect(user.password_hash).toMatch(/^scrypt\$/);
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${w}.png` });

  // Log out: members only.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login\?next=%2Ffeed/);
  await expect(page.getByRole("heading", { name: "Log in to Insidir" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not-my-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator(".login__err")).toContainText("don't match");
  await page.getByLabel("Password", { exact: true }).fill("a-good-password");
  await page.screenshot({ path: `qa/screenshots/login-${w}.png` });
  await page.getByRole("button", { name: "Log in" }).click();
  // Back to where they were going (/feed); a plain log in opens the app on Trackers (below).
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
  const cookie = (await page.context().cookies()).find(c => c.name === "insidir_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // Forgot password: Google users use Continue with Google; anyone else emails us. Never a third party's name.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await expect(page.getByTestId("google-continue")).toHaveText("Continue with Google");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByTestId("forgot-help")).toContainText("email hello@aethric.llc from your sign-up address and we'll reset it within a day.");
  await expect(page.getByTestId("forgot-help")).toContainText('Use "Continue with Google"');
  await expect(page.locator("body")).not.toContainText(/whop/i);
  await page.screenshot({ path: `qa/screenshots/login-${w}.png` });
  expect((await page.goto("/reset"))?.status()).toBe(404);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a-good-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });

  // A refund ends access; logging in again says so.
  await post("/__refund", { email });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]!.plan).toBe("free");
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/start$/);
});

test("Continue with Google: /start → checkout on the Google email → pay → in; log in with Google; no membership", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const gmail = `gbuyer-${w}@gmail.com`, sub = `g_${w}_${Date.now()}`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [gmail]);
  await q("delete from terminal.login_attempts");

  await page.goto("/start");
  await expect(page.locator("body")).not.toContainText(/whop/i);
  await post("/__google_user", { sub, email: gmail, email_verified: true });
  await page.getByTestId("start-google-continue").click();
  // Back on /start, signed in with Google, the checkout open with their Google email locked.
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByTestId("start-google")).toContainText(gmail);
  const form = page.locator("[data-mock-checkout]");
  await expect(form.getByLabel("Email")).toHaveValue(gmail);
  await expect(form.getByLabel("Email")).not.toBeEditable();
  await page.screenshot({ path: `qa/screenshots/start-google-${w}.png`, fullPage: true });
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
  const u = (await q<{ google_id: string; password_hash: string | null; plan: string }>("select google_id, password_hash, plan from terminal.users where email = $1", [gmail]))[0]!;
  expect(u).toMatchObject({ google_id: sub, password_hash: null, plan: "insidir" });

  // Log out, then back in with Google (a new account still has onboarding ahead of the feed).
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await page.getByTestId("google-continue").click();
  await expect(page).toHaveURL(/localhost:\d+\/(onboarding)?$/, { timeout: 15_000 });

  // A Google account without Insidir: told so, with the trial.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await post("/__google_user", { sub: `g_stranger_${w}`, email: `stranger-${w}@gmail.com`, email_verified: true });
  await page.goto("/login");
  await page.getByTestId("google-continue").click();
  await expect(page).toHaveURL(/\/login\?error=no_membership/);
  const none = page.getByTestId("no-membership");
  await expect(none).toContainText(`No Insidir membership for stranger-${w}@gmail.com`);
  await expect(none.getByRole("link", { name: "Try 7 days for $1" })).toHaveAttribute("href", "/start");
  await expect(page.locator("body")).not.toContainText(/whop/i);
  await page.screenshot({ path: `qa/screenshots/login-no-membership-${w}.png` });
  expect(await q("select 1 from terminal.users where email = $1", [`stranger-${w}@gmail.com`])).toHaveLength(0);
});

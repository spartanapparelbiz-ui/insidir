/* The money path, end to end, with Whop stood in by a local mock (qa/e2e/mock-whop.ts):
 *   home → "Get Insidir · $39/mo" → /start: email + password on top, the embedded checkout below → pay → "You're in."
 *   on the feed, logged in, the account made with that email and password; log out → the app is members only → log in
 *   with email and password (a wrong one is refused); "Forgot password?" → "Confirm it's you" → a new password, no
 *   email sent; a refund ends access. */
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
  await page.locator('[data-cta="hero"]').click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Get Insidir." })).toBeVisible();
  await expect(page.getByText("Cancel anytime in 2 clicks. Secure payment by Whop.")).toBeVisible();

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
  await form.getByRole("button", { name: "Pay $39 (test mode)" }).click();

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
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
  const cookie = (await page.context().cookies()).find(c => c.name === "insidir_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // Forgot password: confirm it's you (no email), then a new password. Our URLs never name the provider.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/reset$/);
  await expect(page.getByRole("link", { name: "Confirm it's you" })).toHaveAttribute("href", "/reset/confirm");
  await expect(page.locator("main")).not.toContainText(/whop/i);
  await post("/__oauth_user", { id: whopUserFor(email), email });
  await page.getByRole("link", { name: "Confirm it's you" }).click();
  await expect(page).toHaveURL(/\/reset$/);
  await expect(page.getByRole("heading", { name: "New password" })).toBeVisible();
  await page.getByLabel("New password").fill("a-new-password");
  await page.getByRole("button", { name: "Save and log in" }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a-new-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });

  // A refund ends access; logging in again says so.
  await post("/__refund", { email });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]!.plan).toBe("free");
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/start$/);
});

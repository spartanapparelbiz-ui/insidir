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

test("pay first: /start opens the checkout signed out → pay → Whop sign-in → in; cancel needs one reason; log in; refund ends access", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `buyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  await page.goto("/pricing");
  await page.locator('[data-checkout="pricing"]').first().click();
  await expect(page).toHaveURL(/\/start$/);
  // Signed out: 18+ first (the checkout doesn't open until it's ticked), then the embedded checkout straight away
  // (pay first): no sign-in step, no password.
  const form = page.locator("[data-mock-checkout]");
  await expect(page.getByTestId("age-18")).toContainText("I'm 18 or older.");
  await expect(form).toHaveCount(0);
  expect((await page.request.post("/api/checkout/start", { data: {} })).status()).toBe(400);
  await page.getByTestId("age-18").getByRole("checkbox").check();
  await expect(form).toBeVisible();
  await expect(page.getByTestId("start-pay-first")).toContainText("Pay first; you sign in with Whop right after");
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const due = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  await expect(page.getByTestId("charge-line")).toHaveText(`$1 today. $39 on ${due} unless you cancel.`);
  await expect(page.getByText("Apple Pay and Google Pay where your device has them. Secure payments by Whop.")).toBeVisible();
  await page.screenshot({ path: `qa/screenshots/checkout-${w}.png`, fullPage: true });

  // Pay with an email; then Whop's sign-in (mocked) as the same Whop user, and they're in.
  await post("/__whop_user", { email, name: "Buyer Example" });
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What do you bet on?" })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });
  await expect(page.getByTestId("member-home")).toBeVisible();
  const made = (await q<{ id: string; plan: string; whop_user_id: string; visitor_id: string | null }>("select id, plan, whop_user_id, visitor_id from terminal.users where email = $1", [email]))[0]!;
  expect(made).toMatchObject({ plan: "insidir", whop_user_id: whopUserFor(email) });
  // The 18+ confirmation is stored with the account (carried on the checkout's metadata).
  expect((await q<{ ok: boolean }>("select age_confirmed_at is not null as ok from terminal.users where id = $1", [made.id]))[0]!.ok).toBe(true);
  // The checkout carried the visitor id (no account yet), and the account keeps it for time-to-paid.
  const state = await (await whop("/__state")).json() as { payments: Array<{ metadata: Record<string, string> }> };
  const visitor = (await page.context().cookies()).find(c => c.name === "insidir_vid")?.value;
  expect(state.payments.at(-1)!.metadata).toMatchObject(visitor ? { insidir_visitor_id: visitor } : {});
  expect(state.payments.at(-1)!.metadata.insidir_age_18).toMatch(/^\d{4}-\d\d-\d\dT/);
  if (visitor) expect(made.visitor_id).toBe(visitor);
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${w}.png` });

  // Cancel: one reason is required; then Whop cancels at the end of the period and they keep access.
  await page.goto("/settings");
  await expect(page.getByTestId("manage-subscription")).toHaveAttribute("href", "https://whop.com/@me/settings/orders");
  await page.getByText("Cancel subscription").click();
  const cancel = page.getByTestId("cancel-form");
  await cancel.getByRole("button", { name: "Cancel at the end of this period" }).click();
  await expect(page).toHaveURL(/\/settings$/); // the browser won't send it without a reason
  const direct = await page.request.post("/api/billing/cancel", { form: {}, maxRedirects: 0 });
  expect(direct.headers().location).toContain("/settings?cancel=reason");
  expect(await q("select 1 from terminal.cancel_reasons where user_id = $1", [made.id])).toHaveLength(0);
  await cancel.getByLabel("Too expensive").check();
  await cancel.getByRole("button", { name: "Cancel at the end of this period" }).click();
  await expect(page.getByText("Cancelled. You keep access until the end of the period you paid for.")).toBeVisible();
  expect(await q("select reason from terminal.cancel_reasons where user_id = $1", [made.id])).toEqual([{ reason: "price" }]);
  const after = await (await whop("/__state")).json() as { memberships: Array<{ user: { email: string }; cancel_at_period_end: boolean }> };
  expect(after.memberships.find(m => m.user.email === email)!.cancel_at_period_end).toBe(true);
  await expect(page.getByTestId("cancel-form")).toHaveCount(0);

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
  const callbacks: string[] = [];
  page.on("request", r => { if (/\/(login|reset)\/callback/.test(r.url())) callbacks.push(new URL(r.url()).pathname); });
  await page.goto("/login?next=%2Ffeed");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/start$/, { timeout: 15_000 });
  await expect(page.getByTestId("start-signed-in")).toContainText(email);
  // Whop only has /login/callback registered (as in production): the sign-in comes back there.
  expect(callbacks).toEqual(["/login/callback"]);
  await page.getByTestId("age-18").getByRole("checkbox").check();
  await expect(page.locator("[data-mock-checkout]")).toBeVisible();
  // Whop says the sign-in was cancelled: back to /login, nothing set.
  await page.context().clearCookies();
  await page.goto("/reset/callback?error=access_denied");
  await expect(page).toHaveURL(/\/login\?error=cancelled$/);
  await page.goto("/login/callback?error=access_denied");
  await expect(page).toHaveURL(/\/login\?error=cancelled$/);
  await expect(page.locator(".aerr")).toHaveText("Sign-in was cancelled. Continue when you're ready.");
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
  await page.goto("/welcome?status=succeeded&next=%2Fpricing");
  // /welcome sends them through Whop's sign-in and back (keeping where they were going); signed in and a member.
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fpricing$/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});

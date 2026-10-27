/* The money path, end to end, with Whop and Resend stood in by a local mock (qa/e2e/mock-whop.ts):
 *   home → "Get Insidir · $39/mo" → the checkout embedded on /start → pay → "You're in." on the feed, logged in, with
 *   the account made from the payment's email; log out → the app is members-only → log in with the 6-digit code we
 *   email; an email without a plan gets "No active plan"; a refund removes access. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const lastCode = async (to: string): Promise<string> => {
  const s = await (await whop("/__state")).json() as { emails: Array<{ to: string; subject: string }> };
  return s.emails.filter(e => e.to === to).at(-1)?.subject.match(/^(\d{6})/)?.[1] ?? "";
};

test("get Insidir → embedded checkout → You're in → log out → code log-in → refund ends access", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `buyer-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_codes");

  await page.goto("/?utm_source=instagram&utm_campaign=e2e");
  await expect(page.locator("h1")).toBeVisible();
  await page.locator('[data-cta="hero"]').click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Get Insidir." })).toBeVisible();
  await expect(page.getByText("Cancel anytime.").first()).toBeVisible();
  await page.screenshot({ path: `qa/screenshots/checkout-${w}.png`, fullPage: true });

  // The embedded checkout: email and card, here the test-mode stand-in.
  const form = page.locator("[data-mock-checkout]");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $39 (test mode)" }).click();

  // Logged in the moment the payment lands, on the feed's welcome.
  await expect(page).toHaveURL(/\/feed\?welcome=1/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
  const user = (await q<{ id: string; plan: string; whop_user_id: string }>("select id, plan, whop_user_id from terminal.users where email = $1", [email]))[0]!;
  expect(user).toMatchObject({ plan: "insidir" });
  expect(user.id).toMatch(/^usr_/);
  expect(user.whop_user_id).toMatch(/^user_/);
  const state = await (await whop("/__state")).json() as { webhooks: Array<{ type: string; status: number }> };
  expect(state.webhooks).toEqual([{ type: "membership.activated", status: 200 }, { type: "payment.succeeded", status: 200 }]);
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${w}.png` });

  // Log out: the app is for members only.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login\?next=%2Ffeed/);
  await expect(page.getByRole("heading", { name: "Log in to Insidir" })).toBeVisible();

  // An email without a plan: no code, and the way in.
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.locator(".login__err")).toContainText("No active plan for this email.");
  await expect(page.locator(".login__err").getByRole("link")).toBeVisible();

  // The member: email → code → in.
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  await page.screenshot({ path: `qa/screenshots/login-code-${w}.png` });
  const code = await lastCode(email);
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Code").fill(code);
  await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
  const cookie = (await page.context().cookies()).find(c => c.name === "insidir_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // A refund ends access.
  await whop("/__refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [email]))[0]!.plan).toBe("free");
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/start$/);
});

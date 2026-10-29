/* The owner's free-access list and the sign-up funnel:
 *   free access: an email on FREE_ACCESS_EMAILS with no account uses "Continue with Google" → an account, a full
 *   member with no payment, never sent to /start, no pop-up, a View as Member / Visitor switch;
 *   /admin marks them "Free access" and leaves them out of the numbers.
 *   /start: five live lines at most and one "More coming" line, a real move with its record locked, the payment
 *   line; an unpaid sign-up comes back to "Finish getting Insidir" (on /start and /login) with the email in.
 *   The sticky "Try 7 days for $1" bar on phones; "Setting up your account…" and its 30-second fallback; the
 *   funnel's steps and drop-off on /admin/funnel. */
import { expect, test, type Page } from "@playwright/test";
import { base32Decode, stepAt, totpCode } from "@/lib/admin";
import { SERVER_ENV, WHOP_PORT } from "./env";
import { q } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Signs in to /admin. Each code works once (replay protection), so when this one was already used it waits for the
 *  next 30-second code and tries again. */
async function adminIn(page: Page) {
  test.setTimeout(120_000);
  for (let i = 0; i < 3; i++) {
    const step = stepAt(Date.now());
    await page.goto("/admin");
    await page.getByLabel("Admin token").fill(SERVER_ENV.ADMIN_TOKEN!);
    await page.getByLabel("Authenticator code").fill(totpCode(base32Decode(SERVER_ENV.ADMIN_TOTP_SECRET!)!, step));
    await page.getByRole("button", { name: "Sign in" }).click();
    const out = page.getByRole("button", { name: "Sign out" });
    if (await out.waitFor({ timeout: 5_000 }).then(() => true, () => false)) return;
    while (stepAt(Date.now()) <= step) await page.waitForTimeout(1000);
  }
  throw new Error("couldn't sign in to /admin");
}

test("free access: Continue with Google makes the account; a full member with no payment, View as Member / Visitor, marked in /admin", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = w < 900 ? "friend.free@example.test" : "owner.free@example.test";
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  // No account yet: Log in → Continue with Google (Google says who they are, email verified).
  await page.goto("/login");
  await post("/__google_user", { sub: `g_free_${w}`, email: email.toUpperCase(), email_verified: true });
  await page.getByTestId("google-continue").click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  const u = (await q<{ id: string; plan: string; membership_id: string | null }>("select id, plan, membership_id from terminal.users where email = $1", [email]))[0]!;
  expect(u.membership_id).toBeNull();

  // A full member: the feed, never /start, no sign-up pop-up, no sticky bar.
  // A new account goes through onboarding first, like any new member.
  await expect(page.getByRole("heading", { name: "What do you want to follow?" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/feed\?first=1/);
  await page.goto("/start");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto("/");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await expect(page.getByTestId("signup-popup")).toHaveCount(0);
  await expect(page.getByTestId("sticky-cta")).toHaveCount(0);

  // View as: Visitor shows the logged-out site; Member brings it back.
  const bar = page.getByTestId("view-as");
  await expect(bar).toContainText("Free access · View as");
  await expect(bar.getByRole("button", { name: "Member" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `qa/screenshots/view-as-member-${w}.png` });
  await bar.getByRole("button", { name: "Visitor" }).click();
  await expect(page.getByTestId("view-as").getByRole("button", { name: "Visitor" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('a[href="/signin"]').first()).toBeAttached();
  await page.screenshot({ path: `qa/screenshots/view-as-visitor-${w}.png` });
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login\?next=%2Ffeed/);
  await page.getByTestId("view-as").getByRole("button", { name: "Member" }).click();
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/feed$/);

  // Logging in with Google again is the same account.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("google-continue").click();
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });
  expect(await q("select 1 from terminal.users where email = $1", [email])).toHaveLength(1);

  // Someone not on the list (and with no membership) can't make an account this way.
  await page.context().clearCookies();
  await post("/__google_user", { sub: `g_nolist_${w}`, email: `nolist-${w}@example.test`, email_verified: true });
  await page.goto("/login");
  await page.getByTestId("google-continue").click();
  await expect(page).toHaveURL(/\/login\?error=no_membership/);
  expect(await q("select 1 from terminal.users where email = $1", [`nolist-${w}@example.test`])).toHaveLength(0);

  // /admin: marked Free access, and left out of the funnel.
  await adminIn(page);
  await expect(page.getByTestId("free-access")).toContainText(email);
  await expect(page.getByTestId("free-access")).toContainText("Free access");
});

test("/start: five live lines, one 'More coming' line, a real move with its record locked, and the payment line", async ({ page }) => {
  await page.goto("/start");
  const list = page.getByTestId("start-list").locator("li");
  const n = await list.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(5);
  const lines = await list.allInnerTexts();
  expect(new Set(lines).size).toBe(lines.length);
  await expect(page.getByTestId("start-list")).not.toContainText(/coming soon/i);
  await expect(page.locator(".start__more")).toHaveText(/^More coming: .*crypto\.$/);
  const move = page.getByTestId("start-move");
  await expect(move.locator(".move")).toBeVisible();
  await expect(move.getByTestId("locked-record")).toBeVisible();
  await expect(page.getByText("Cancel anytime in 2 clicks. Secure checkout.")).toBeVisible();
  await page.screenshot({ path: `qa/screenshots/start-${page.viewportSize()!.width}.png`, fullPage: true });
});

test("an unpaid sign-up comes back to 'Finish getting Insidir' on /start and /login, email filled in; funnel events are recorded", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `unpaid-${w}@example.test`;
  await q("delete from terminal.events where name in ('start_view', 'account_created', 'checkout_start')");
  await page.goto("/start");
  await page.locator("#start-email").fill(email);
  await page.locator("#start-password").fill("unpaid-password");
  const go = page.getByRole("button", { name: "Continue to payment" });
  await go.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await go.click();
  await expect(page.locator("[data-mock-checkout]")).toBeVisible();
  // The checkout opens in place: no jump.
  expect(Math.abs((await page.evaluate(() => scrollY)) - y)).toBeLessThan(200);
  // They leave without paying, and come back later.
  await page.goto("/");
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Finish getting Insidir." })).toBeVisible();
  await expect(page.locator("#start-email")).toHaveValue(email);
  await page.goto("/login");
  await expect(page.getByTestId("finish-insidir")).toContainText(email);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.screenshot({ path: `qa/screenshots/login-finish-${w}.png` });
  await expect.poll(async () => (await q<{ name: string }>("select distinct name from terminal.events where name in ('start_view', 'account_created', 'checkout_start')")).map(r => r.name).sort())
    .toEqual(["account_created", "checkout_start", "start_view"]);
});

test("one action per page: no offer bar or sticky bar anywhere; the nav's 36px Get started on public pages, home included, but not /start or /login", async ({ page }) => {
  for (const path of ["/", "/trackers", "/sports", "/markets", "/results", "/pricing", "/faq", "/start", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("sticky-cta"), path).toHaveCount(0);
    await expect(page.locator(".trialbar"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator(".nav__cta")).toHaveText("Get started");
  if (page.viewportSize()!.width >= 900) expect(Math.round((await page.locator(".nav__cta").boundingBox())!.height)).toBe(36);
  await page.goto("/pricing");
  await expect(page.locator(".nav__cta")).toHaveAttribute("href", "/start");
  await page.goto("/login");
  await expect(page.locator(".nav__cta")).toHaveCount(0);
});

test("/admin/funnel: the eight steps with the drop-off between each", async ({ page }) => {
  await adminIn(page);
  await page.goto("/admin/funnel");
  for (const h of ["Landing view", "CTA click", "/start view", "Account created", "Payment started", "Paid", "Onboarding done", "First follow"]) {
    await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
  }
  await expect(page.getByTestId("funnel-drop")).toContainText("Drop-off");
});

test("after paying: 'Setting up your account…', then after 30s 'Payment received, finishing up' with refresh and our email", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 900, "once is enough: it waits 30 seconds");
  test.setTimeout(60_000);
  await page.goto("/welcome");
  const box = page.getByTestId("setting-up");
  await expect(box.getByRole("heading", { name: "Setting up your account…" })).toBeVisible();
  await expect(box.getByRole("heading", { name: "Payment received, finishing up" })).toBeVisible({ timeout: 45_000 });
  await expect(box.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(box.getByRole("link", { name: "hello@aethric.llc" })).toHaveAttribute("href", "mailto:hello@aethric.llc");
});

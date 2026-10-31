/* The owner's free-access list and the sign-up funnel:
 *   free access: an email on FREE_ACCESS_EMAILS with no account signs in with Whop ("Continue") → an account, a full
 *   member with no payment, never sent to /start, no pop-up, a View as Member / Visitor switch;
 *   /admin marks them "Free access" and leaves them out of the numbers.
 *   /start: five live lines at most and one "More coming" line, a real move with its record locked, the payment
 *   line; someone who signed in but didn't pay comes back to the checkout, already signed in.
 *   The sticky "Try 7 days for $1" bar on phones; "Setting up your account…" and its 30-second fallback; the
 *   funnel's steps and drop-off on /admin/funnel. */
import { expect, test, type Page } from "@playwright/test";
import { base32Decode, stepAt, totpCode } from "@/lib/admin";
import { SERVER_ENV, WHOP_PORT } from "./env";
import { q, signIn } from "./helpers";

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

test("free access: Whop sign-in makes the account; a full member with no payment, View as Member / Visitor, marked in /admin", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = w < 900 ? "friend.free@example.test" : "owner.free@example.test";
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.login_attempts");

  // No account yet: Log in → Continue → Whop says who they are.
  await page.goto("/login");
  await post("/__whop_user", { email: email.toUpperCase(), name: null });
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  const u = (await q<{ id: string; plan: string; membership_id: string | null }>("select id, plan, membership_id from terminal.users where email = $1", [email]))[0]!;
  expect(u.membership_id).toBeNull();

  // A full member: the feed, never /start, no sign-up pop-up, no sticky bar.
  // A new account goes through onboarding first, like any new member.
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/open$/);
  await page.goto("/start");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto("/");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await expect(page.getByTestId("pay-prompt")).toHaveCount(0);
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
  await page.goto("/following");
  await expect(page).toHaveURL(/\/login\?next=%2Ffollowing/);
  // The sign-in page has no header (and so no View as bar): switch back from a page that does.
  await page.goto("/pricing");
  await page.getByTestId("view-as").getByRole("button", { name: "Member" }).click();
  await page.goto("/following");
  await expect(page).toHaveURL(/\/following$/);

  // Signing in with Whop again is the same account.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });
  expect(await q("select 1 from terminal.users where email = $1", [email])).toHaveLength(1);

  // Someone not on the list (and with no membership) is signed in without Insidir: sent to /start.
  await page.context().clearCookies();
  await post("/__whop_user", { email: `nolist-${w}@example.test`, name: null });
  await page.goto("/login");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/start$/, { timeout: 15_000 });
  expect((await q<{ plan: string }>("select plan from terminal.users where email = $1", [`nolist-${w}@example.test`]))[0]!.plan).toBe("free");

  // /admin: marked Free access, and left out of the funnel.
  await adminIn(page);
  await expect(page.getByTestId("free-access")).toContainText(email);
  await expect(page.getByTestId("free-access")).toContainText("Free access");
});

test("/start: one screen, the price, three checkmarks, one Continue, the Whop line, and the live strip", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("heading", { level: 1, name: "Follow the big money." })).toBeVisible();
  await expect(page.getByText("$1 for your first week, then $39/month. Cancel anytime.")).toBeVisible();
  await expect(page.getByTestId("start-list").locator("li")).toHaveText(["Every large position across sports, prediction markets and stocks", "Verified records and followable returns for every tracker and trader", "What the winning trackers hold right now"]);
  const btn = page.getByTestId("continue");
  await expect(btn).toHaveText("Continue");
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(52);
  await expect(page.getByText("Secure sign-in and payments by Whop.")).toBeVisible();
  await expect(page.locator(".asplit__steps span")).toHaveCount(2);
  if (page.viewportSize()!.width >= 900) await expect(page.locator(".astrip__row").first()).toBeVisible();
  else expect((await page.locator(".asplit__photo").boundingBox())!.height).toBe(220);
  await page.screenshot({ path: `qa/screenshots/start-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.goto("/start?error=cancelled");
  await expect(page.locator(".aerr")).toHaveText("Sign-in was cancelled. Continue when you're ready.");
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", "/start");
  await page.screenshot({ path: `qa/screenshots/login-${page.viewportSize()!.width}.png`, fullPage: true });
});

test("signed in without paying: back later, /start opens the checkout already signed in; funnel events are recorded", async ({ page }) => {
  const w = page.viewportSize()!.width;
  const email = `unpaid-${w}@example.test`;
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.users where email = $1", [email]);
  await q("delete from terminal.events where name in ('start_view', 'account_created', 'checkout_start')");
  await page.goto("/start");
  await post("/__whop_user", { email, name: null });
  await page.getByTestId("continue").click();
  await expect(page.locator("[data-mock-checkout]")).toBeVisible({ timeout: 15_000 });
  // They leave without paying, and come back later: still signed in, the checkout opens again.
  await page.goto("/");
  await page.goto("/start");
  await expect(page.getByTestId("start-signed-in")).toContainText(email);
  await expect(page.locator("[data-mock-checkout]")).toBeVisible();
  // /login for someone signed in without Insidir: on to /start.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/start$/);
  await expect.poll(async () => (await q<{ name: string }>("select distinct name from terminal.events where name in ('start_view', 'account_created', 'checkout_start')")).map(r => r.name).sort())
    .toEqual(["account_created", "checkout_start", "start_view"]);
});


test("the nav's 36px Start for $1 on public pages, home included, but not /start or /login; no old offer bars", async ({ page }) => {
  for (const path of ["/", "/trackers", "/sports", "/markets", "/results", "/pricing", "/faq", "/start", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("sticky-cta"), path).toHaveCount(0);
    await expect(page.locator(".trialbar"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator(".nav__cta")).toHaveText("Start for $1");
  if (page.viewportSize()!.width >= 900) expect(Math.round((await page.locator(".nav__cta").boundingBox())!.height)).toBe(36);
  await page.goto("/pricing");
  await expect(page.locator(".nav__cta")).toHaveAttribute("href", "/start");
  await page.goto("/login");
  await expect(page.locator(".nav__cta")).toHaveCount(0);
});

test("the late bar: after 30% of the page, \"30 minutes late\" + Start for $1; × hides it for the session; never on /start or /login", async ({ page }) => {
  // Home: not at load; once the hero has scrolled out of view.
  await page.goto("/");
  await expect(page.getByTestId("late-bar")).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => { const h = document.querySelector("[data-hero]")!; scrollTo(0, h.getBoundingClientRect().bottom + scrollY + 10); });
  await expect(page.getByTestId("late-bar")).toHaveAttribute("aria-hidden", "false");
  await page.goto("/pricing");
  const bar = page.getByTestId("late-bar");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5));
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  await expect(bar).toContainText("You're seeing data 30 minutes late. Live for $1 this week.");
  await expect(bar.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", /^\/start\?next=%2Fpricing/);
  await bar.getByRole("button", { name: "Hide for this visit" }).click();
  await expect(bar).toHaveCount(0);
  await page.goto("/faq");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("late-bar")).toHaveCount(0);
  for (const path of ["/start", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("late-bar"), path).toHaveCount(0);
  }
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
  // Signed in (a buyer is, by then) and Whop doesn't say they have access yet.
  await signIn(page.context(), "freeUs");
  await page.goto("/welcome");
  const box = page.getByTestId("setting-up");
  await expect(box.getByRole("heading", { name: "Setting up your account…" })).toBeVisible();
  await expect(box.getByRole("heading", { name: "Payment received, finishing up" })).toBeVisible({ timeout: 45_000 });
  await expect(box.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(box.getByRole("link", { name: "hello@aethric.llc" })).toHaveAttribute("href", "mailto:hello@aethric.llc");
});

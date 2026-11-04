/* The owner's free-access list and the sign-up funnel:
 *   free access: an email on FREE_ACCESS_EMAILS with no account signs in with Whop ("Continue") → an account, a full
 *   member with no payment, never sent to the funnel, no pop-up, a View as Member / Visitor switch;
 *   /admin marks them "Free access" and leaves them out of the numbers.
 *   The sticky "Try 3 days for $1" bar on phones; "Setting up your account…" and its 30-second fallback; the
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
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });
  const u = (await q<{ id: string; plan: string; membership_id: string | null }>("select id, plan, membership_id from terminal.users where email = $1", [email]))[0]!;
  expect(u.membership_id).toBeNull();

  // A full member: never the funnel, no sign-up pop-up, no sticky bar.
  await expect(page.getByTestId("member-home")).toBeVisible();
  await page.goto("/go");
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
  await expect(page.locator('a[href="/login"]').first()).toBeAttached();
  await page.screenshot({ path: `qa/screenshots/view-as-visitor-${w}.png` });
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)settings/);
  // The sign-in page has no header (and so no View as bar): switch back from a page that does.
  await page.goto("/pricing");
  await page.getByTestId("view-as").getByRole("button", { name: "Member" }).click();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);

  // Signing in with Whop again is the same account.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });
  expect(await q("select 1 from terminal.users where email = $1", [email])).toHaveLength(1);

  // Someone not on the list (and with no membership): accounts only if you pay, so no account; the paywall.
  await page.context().clearCookies();
  await q("delete from terminal.users where email = $1", [`nolist-${w}@example.test`]);
  await post("/__whop_user", { email: `nolist-${w}@example.test`, name: null });
  await page.goto("/login");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/go\?step=paywall$/, { timeout: 15_000 });
  expect(await q("select 1 from terminal.users where email = $1", [`nolist-${w}@example.test`])).toHaveLength(0);

  // /admin: marked Free access, and left out of the funnel.
  await adminIn(page);
  await expect(page.getByTestId("free-access")).toContainText(email);
  await expect(page.getByTestId("free-access")).toContainText("Free access");
});

test("Start for $1 in the nav on public pages, home included (the brand nav's pill → /go), but not /login; no old offer bars", async ({ page }) => {
  for (const path of ["/", "/board", "/markets", "/results", "/pricing", "/faq", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("sticky-cta"), path).toHaveCount(0);
    await expect(page.locator(".trialbar"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.getByTestId("nav-start")).toHaveText("Start for $1");
  await expect(page.getByTestId("nav-start")).toHaveAttribute("href", "/go");
  expect(Math.round((await page.getByTestId("nav-start").boundingBox())!.height)).toBeGreaterThanOrEqual(28);
  await page.goto("/pricing");
  await expect(page.locator(".nav__cta")).toHaveAttribute("href", "/go");
  await page.goto("/login");
  await expect(page.locator(".nav__cta")).toHaveCount(0);
});

test("the late bar: after 30% of the page, \"60 minutes late\" + Start for $1; × hides it for the session; never on home or /login", async ({ page }) => {
  // Home is the tool (a visitor's Read isn't late): never there.
  await page.goto("/");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("late-bar")).toHaveCount(0);
  await page.goto("/pricing");
  const bar = page.getByTestId("late-bar");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5));
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  await expect(bar).toContainText("You're seeing data 60 minutes late. Live: $1 for your first 3 days.");
  await expect(bar.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", /^\/go\?from=latebar/);
  await bar.getByRole("button", { name: "Hide for this visit" }).click();
  await expect(bar).toHaveCount(0);
  await page.goto("/faq");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("late-bar")).toHaveCount(0);
  for (const path of ["/login"]) {
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
  await page.goto("/go?from=checkout");
  const box = page.getByTestId("setting-up");
  await expect(box.getByRole("heading", { name: "Setting up your account…" })).toBeVisible();
  await expect(box.getByRole("heading", { name: "Payment received, finishing up" })).toBeVisible({ timeout: 45_000 });
  await expect(box.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(box.getByRole("link", { name: "hello@aethric.llc" })).toHaveAttribute("href", "mailto:hello@aethric.llc");
});

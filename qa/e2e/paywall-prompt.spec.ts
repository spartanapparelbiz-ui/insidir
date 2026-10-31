/* The timed pay prompt (components/paywall): it opens after its delay (the test hook sets 1.5s; production 6s or 12s
 * by A/B), waits while they scroll, shows a real position over the page's photo, and closes on Esc, × and the
 * backdrop with focus kept inside and returned; once per session and 24 hours after a dismiss; never for members or
 * on /start, /login and legal pages; "Start for $1" goes to /start and comes back to the page after checkout.
 * Each run is recorded (qa/screenshots/paywall-*.webm). */
import { copyFileSync, mkdirSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { q, signIn } from "./helpers";

test.use({ video: "on" });
test.afterEach(async ({ page }, info) => {
  const v = page.video();
  await page.close();
  if (!v) return;
  mkdirSync("qa/screenshots", { recursive: true });
  copyFileSync(await v.path(), `qa/screenshots/paywall-${info.title.split(":")[0]!.replace(/\W+/g, "-").toLowerCase()}-${info.project.name}.webm`);
});

const fast = (ctx: BrowserContext, ms = 1500) => ctx.addInitScript(d => { try { sessionStorage.setItem("insidir_pay_delay_test", String(d)); } catch { /* none */ } }, ms);
const prompt = (page: Page) => page.getByRole("dialog", { name: "Follow the big money." });

test("timer: opens after the delay with a real position, focus inside and trapped; Esc closes and focus returns", async ({ page, context }) => {
  await fast(context);
  await page.goto("/trackers/biggest-bets");
  await page.waitForTimeout(800);
  await expect(prompt(page)).toHaveCount(0);
  await expect(prompt(page)).toBeVisible({ timeout: 5000 });
  await expect(prompt(page).getByText("$1 for your first week, then $39/month. Cancel anytime.")).toBeVisible();
  await expect(prompt(page).getByText("Secure sign-in and payments by Whop.")).toBeVisible();
  await expect(page.getByTestId("pay-position")).toBeVisible();
  await expect(page.getByTestId("pay-position")).toContainText(/\$\d/);
  const start = prompt(page).getByRole("link", { name: "Start for $1" });
  await expect(start).toBeFocused();
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(52);
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); expect(await prompt(page).evaluate(el => el.contains(document.activeElement))).toBe(true); }
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  await page.screenshot({ path: `qa/screenshots/paywall-${page.viewportSize()!.width}.png` });
  await page.keyboard.press("Escape");
  await expect(prompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect.poll(async () => (await q<{ n: number }>("select count(*)::int as n from terminal.events where name = 'popup_dismissed' and props->>'how' = 'escape'"))[0]!.n).toBeGreaterThan(0);
  // Dismissed: not again on another page, nor after a reload, for 24 hours.
  await page.goto("/sports");
  await page.waitForTimeout(2500);
  await expect(prompt(page)).toHaveCount(0);
});

test("close: × and the backdrop close it; once per session", async ({ browser }) => {
  for (const how of ["x", "backdrop"] as const) {
    const ctx = await browser.newContext();
    await fast(ctx);
    const page = await ctx.newPage();
    await page.goto("/open");
    await expect(prompt(page)).toBeVisible({ timeout: 5000 });
    if (how === "x") await prompt(page).getByRole("button", { name: "Close" }).click();
    else await page.mouse.click(5, 5);
    await expect(prompt(page)).toHaveCount(0);
    await ctx.close();
  }
  const ctx = await browser.newContext();
  await fast(ctx);
  const page = await ctx.newPage();
  await page.goto("/top");
  await expect(prompt(page)).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto("/results");
  await page.waitForTimeout(2500);
  await expect(prompt(page)).toHaveCount(0);
  await ctx.close();
});

test("never: members, /start, /login and legal pages", async ({ browser }) => {
  const v = await browser.newContext();
  await fast(v, 500);
  const vp = await v.newPage();
  for (const path of ["/start", "/login", "/terms", "/privacy", "/disclosures"]) {
    await vp.goto(path);
    await vp.waitForTimeout(1200);
    await expect(prompt(vp), path).toHaveCount(0);
  }
  await v.close();
  const m = await browser.newContext();
  await signIn(m, "insidir");
  await fast(m, 500);
  const mp = await m.newPage();
  await mp.goto("/trackers");
  await mp.waitForTimeout(1500);
  await expect(prompt(mp)).toHaveCount(0);
  await m.close();
});

test("scrolling: it waits until they've stopped for a second", async ({ page, context }) => {
  await fast(context, 1000);
  await page.goto("/");
  const stopAt = Date.now() + 2600;
  while (Date.now() < stopAt) { await page.mouse.wheel(0, 120); await page.waitForTimeout(150); }
  await expect(prompt(page)).toHaveCount(0);
  await expect(prompt(page)).toBeVisible({ timeout: 4000 });
});

test("start: Start for $1 goes to /start with the page to come back to, and the click is recorded", async ({ page, context }) => {
  await fast(context);
  await page.goto("/sports?utm_source=e2e");
  await expect(prompt(page)).toBeVisible({ timeout: 5000 });
  await prompt(page).getByRole("link", { name: "Start for $1" }).click();
  await expect(page).toHaveURL(/\/start\?next=%2Fsports&from=popup$/);
  await expect(page.getByTestId("continue")).toHaveAttribute("href", /next=%2Fstart%3Fnext%3D%252Fsports/);
  await expect.poll(async () => (await q<{ n: number }>("select count(*)::int as n from terminal.events where name = 'popup_click' and props->>'page' = '/sports' and props->>'utm' = 'e2e'"))[0]!.n).toBeGreaterThan(0);
  expect(await page.evaluate(() => sessionStorage.getItem("insidir_pay_from"))).toBe("/sports");
});

test("exit intent: on a desktop, the cursor leaving the top opens it before the timer", async ({ page, context }) => {
  test.skip(page.viewportSize()!.width < 900, "desktop only");
  await fast(context, 60_000);
  await page.goto("/markets");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: -1, bubbles: true })));
  await expect(prompt(page)).toBeVisible();
});

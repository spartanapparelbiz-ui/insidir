/* The home page's four laptops (components/home/Laptops.tsx): each is a button whose screen previews its market from
 * real rows; clicking one opens the panel below (the big laptop and the value), the others fade; clicking it again, ×
 * or Esc closes it and focus goes back; another switches; the URL hash opens one; keyboard works; motion is off under
 * reduced motion; crypto's Notify me saves the email. Each run is recorded (qa/screenshots/laptops-*.webm). */
import { copyFileSync, mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { q, shotName } from "./helpers";

test.use({ video: "on" });

const laptop = (page: Page, name: RegExp) => page.locator(".lt__item", { has: page.locator(".lt__name", { hasText: name }) });
const panel = (page: Page) => page.locator("#lt-panel");

/** Keep each test's recording next to the screenshots. */
test.afterEach(async ({ page }, info) => {
  const v = page.video();
  await page.close();
  if (!v) return;
  mkdirSync("qa/screenshots", { recursive: true });
  copyFileSync(await v.path(), `qa/screenshots/laptops-${(info.title.split(":")[0] ?? info.title).replace(/\W+/g, "-").toLowerCase()}-${info.project.name}.webm`);
});

test("click: four laptops with live screens; each opens its panel, the others fade, another switches, the same one closes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Four markets. One membership." })).toBeVisible();
  await expect(page.getByText("Click a laptop to look inside.")).toBeVisible();
  const items = page.locator(".lt__item");
  await expect(items).toHaveCount(4);
  await expect(items.locator(".lt__name")).toHaveText(["Sports", "Prediction markets", "Stocks", "CryptoSoon"]);
  for (const b of await items.all()) {
    await expect(b).toHaveAttribute("aria-expanded", "false");
    await expect(b).toHaveAttribute("aria-controls", "lt-panel");
  }
  // Never blank: real rows on the sports, markets and stocks screens; crypto says Soon.
  for (const n of [/^Sports$/, /^Prediction markets$/, /^Stocks$/]) await expect(laptop(page, n).locator(".lmini__row").first()).toBeVisible();
  await expect(laptop(page, /^Crypto/).locator(".lcrypto__soon")).toHaveText("Soon");
  await expect(panel(page)).toBeHidden();
  await page.locator(".lt").scrollIntoViewIfNeeded();

  // Sports: open, the others at half opacity, the URL says #sports.
  await laptop(page, /^Sports$/).click();
  await expect(laptop(page, /^Sports$/)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText("Every large bet on every game.");
  await expect(panel(page)).toHaveAccessibleName("Every large bet on every game.");
  await expect(panel(page)).toBeInViewport({ ratio: 0.2 });
  await expect(page).toHaveURL(/#sports$/);
  await expect(laptop(page, /^Stocks$/).locator(".lap")).toHaveCSS("opacity", "0.5");
  await expect(panel(page).locator(".lrow").first()).toBeVisible();
  await expect(panel(page).locator(".lval__proof dt").first()).toHaveText("Sports volume tracked, last 30 days");
  await expect(panel(page).getByRole("link", { name: "Start your 7-day trial" })).toBeVisible();
  await expect(panel(page).getByText("$1 for the first week, then $39 a month. Cancel anytime.")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotName("laptops-sports", page), fullPage: false });

  // Prediction markets: switch.
  await laptop(page, /^Prediction markets$/).click();
  await expect(laptop(page, /^Sports$/)).toHaveAttribute("aria-expanded", "false");
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText("See who's on each side, and their record.");
  await expect(panel(page).locator(".lval__proof dt")).toHaveText(["Volume on these topics, last 30 days", "Open positions right now"]);
  await expect(page).toHaveURL(/#markets$/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotName("laptops-markets", page) });

  // Stocks: the insider and the price since the filing.
  await laptop(page, /^Stocks$/).click();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText("Every CEO purchase, straight from the filing.");
  await expect(panel(page).locator(".lrow__sub").first()).toContainText("filed");
  await expect(panel(page).locator(".lval__proof dt")).toHaveText(["CEO purchases, last 30 days", "Insider purchases filed this week"]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotName("laptops-stocks", page) });

  // Crypto: Soon, no rows.
  await laptop(page, /^Crypto/).click();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText("Large positions on crypto price markets, and the wallets behind them.");
  await expect(panel(page).getByText("Included in your membership when it launches.")).toBeVisible();
  await expect(panel(page).locator(".lrow")).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotName("laptops-crypto", page) });

  // The same laptop again closes it; × closes too.
  await laptop(page, /^Crypto/).click();
  await expect(panel(page)).toBeHidden();
  await expect(page).not.toHaveURL(/#/);
  await laptop(page, /^Sports$/).click();
  await panel(page).getByRole("button", { name: "Close preview" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(laptop(page, /^Sports$/)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("visitors: 3 rows, 30 minutes late, and how many more", async ({ page }) => {
  await page.goto("/#sports");
  const rows = panel(page).locator(".lrow");
  expect(await rows.count()).toBeLessThanOrEqual(3);
  await expect(panel(page).locator(".lscreen__bar")).toContainText("30 min delay");
  const api = await (await page.request.get("/api/markets/preview?kind=sports")).json() as { rows: unknown[]; live: boolean };
  expect(api.live).toBe(false);
  expect(api.rows.length).toBeLessThanOrEqual(3);
  expect((await page.request.get("/api/markets/preview?kind=nope")).status()).toBe(400);
});

test("hash: a link to #stocks opens the stocks panel", async ({ page }) => {
  await page.goto("/#stocks");
  await expect(laptop(page, /^Stocks$/)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText("Every CEO purchase, straight from the filing.");
  await expect(panel(page)).toBeInViewport({ ratio: 0.2 });
});

test("keyboard: Tab to a laptop, Enter opens it, Tab reaches the panel, Esc closes and returns focus", async ({ page }) => {
  await page.goto("/");
  await page.locator(".lt").scrollIntoViewIfNeeded();
  await laptop(page, /^Sports$/).focus();
  await page.keyboard.press("Tab");
  await expect(laptop(page, /^Prediction markets$/)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(laptop(page, /^Prediction markets$/)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(laptop(page, /^Stocks$/)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(laptop(page, /^Stocks$/)).toBeFocused();
});

test("reduced motion: no lift, no lid tilt, no rise or fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await laptop(page, /^Sports$/).hover();
  await expect(laptop(page, /^Sports$/).locator(".lap")).toHaveCSS("transform", "none");
  await laptop(page, /^Sports$/).click();
  await expect(laptop(page, /^Sports$/).locator(".lap__lid")).toHaveCSS("transform", "none");
  await expect(panel(page)).toHaveCSS("animation-name", "none");
  await expect(panel(page).locator(".lscreen")).toHaveCSS("animation-name", "none");
});

test("crypto: Notify me saves the email to the waitlist", async ({ page }) => {
  const email = `laptops-${Date.now()}@example.com`;
  await page.goto("/#crypto");
  await panel(page).getByPlaceholder("you@example.com").fill(email);
  await panel(page).getByRole("button", { name: "Notify me" }).click();
  await expect(panel(page).getByRole("status")).toHaveText("Thanks. You're on the list.");
  expect(await q("select feature from terminal.waitlist where email = $1", [email])).toEqual([{ feature: "crypto" }]);
});

test("accessibility: no axe violations in the laptops, closed or with any panel open", async ({ page }) => {
  await page.goto("/");
  const scan = async (label: string) => {
    // The small laptops' screens are pictures of the product, hidden from assistive tech; faded, they're incidental
    // text (WCAG 1.4.3 exempts it). Everything else, the panel included, is checked.
    const r = await new AxeBuilder({ page }).include(".lt").exclude(".lt__item .lap__screen").analyze();
    expect(r.violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(" ")} ${n.any[0]?.message ?? ""}`)), label).toEqual([]);
  };
  await scan("closed");
  for (const k of ["sports", "markets", "stocks", "crypto"]) {
    await page.goto(`/#${k}`);
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(600);
    await scan(k);
  }
});

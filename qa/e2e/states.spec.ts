/* The states a visitor can land in besides the happy path: the 404, an error, and each empty state on the public
 * and Pro pages. Every one says what happened and offers a next step with a button. Whatever a test changes in
 * the database it puts back. */
import { expect, test } from "@playwright/test";
import { footerOk, noHorizontalScroll, q, signIn } from "./helpers";

test("404: on-brand, says what happened, links back home", async ({ page }) => {
  const res = await page.goto("/no-such-page-anywhere");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found.");
  await expect(page.getByText("This page doesn't exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation", { name: "Elsewhere" }).getByRole("link", { name: "Status" })).toHaveAttribute("href", "/status");
  // The site's own page (Schibsted Grotesk), not the framework's default.
  const [body, sans] = await page.evaluate(() => [getComputedStyle(document.body).fontFamily, getComputedStyle(document.documentElement).getPropertyValue("--font-schibsted")]);
  expect(sans.trim()).not.toBe("");
  expect(body.replace(/["']/g, "")).toContain(sans.split(",")[0]!.trim().replace(/["']/g, ""));
  await footerOk(page);
  await noHorizontalScroll(page);
});

test("one primary action: pricing and legal pages show exactly one; the landing's white pills are only Start for $1", async ({ page }) => {
  await page.goto("/");
  const home = await page.locator("main [data-checkout]").evaluateAll(els => els.map(e => (e as HTMLElement).textContent!.replace(/→/g, "").trim()));
  expect(home.length).toBeGreaterThan(1);
  for (const t of home) expect(["Start for $1"]).toContain(t);
  for (const path of ["/pricing", "/terms", "/privacy"]) {
    await page.goto(path);
    // Pictures of the app are inert, and a closed laptop panel isn't shown: neither is an action on this page.
    const primaries = await page.locator("main .b-primary").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null && !e.closest("[inert]")).length);
    expect(primaries, path).toBe(1);
  }
});

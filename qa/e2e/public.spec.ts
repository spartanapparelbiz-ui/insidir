/* No sign-in needed: the feed shows (delayed, top 3, sizes hidden), every page has the footer and legal links,
 * no internal link 404s, nothing scrolls sideways, and every page is screenshotted at both sizes. */
import { expect, test } from "@playwright/test";
import { dealId, footerOk, noHorizontalScroll, PRO_PAGES, PUBLIC_PAGES, shotName, signIn } from "./helpers";

test("the Terminal works without signing in: delayed, top 3, sizes hidden", async ({ page }) => {
  await page.goto("/terminal");
  const rows = page.locator(".deal");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(3);
  await expect(page.getByText("30 min delay").first()).toBeVisible();
  // Only deals found more than 30 minutes ago; the two fresh ones never appear.
  await expect(page.getByText("Will the Hawks win")).toHaveCount(0);
  await expect(page.getByText("Will the Fed cut")).toHaveCount(0);
  await expect(page.locator("[data-unlock]").first()).toBeVisible();
});

test("every page: footer disclaimer, privacy and terms links, no sideways scroll, screenshot", async ({ page, context }) => {
  const handcheck = await dealId("Hawks"), old = await dealId("Jets");
  for (const path of [...PUBLIC_PAGES, `/deal/${old}`, "/admin"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await footerOk(page);
    await noHorizontalScroll(page);
    const name = path === "/" ? "landing" : path.startsWith("/deal/") ? "deal-free" : path.slice(1) + (path === "/terminal" ? "-free" : path === "/admin" ? "-login" : "");
    await page.screenshot({ path: shotName(name, page), fullPage: true });
  }
  await signIn(context, "pro");
  for (const path of [...PRO_PAGES, `/deal/${handcheck}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await footerOk(page);
    await noHorizontalScroll(page);
    const name = path.startsWith("/deal/") ? "deal-pro" : path.slice(1) + (path === "/terminal" ? "-pro" : "");
    await page.screenshot({ path: shotName(name, page), fullPage: true });
  }
  const missing = await page.goto("/this-page-does-not-exist");
  expect(missing?.status()).toBe(404);
  await footerOk(page);
  await page.screenshot({ path: shotName("not-found", page), fullPage: true });
});

test("no internal link leads to a 404 (signed out and as Pro)", async ({ page, context, request }) => {
  const seen = new Map<string, number>();
  const crawl = async (pages: string[]) => {
    for (const path of pages) {
      await page.goto(path);
      const hrefs = await page.locator("a[href^='/']").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
      for (const h of hrefs) {
        const clean = h.split("#")[0]!;
        // Sign-in and API links leave for Whop or change state; they're covered by the checkout test.
        if (!clean || seen.has(clean) || clean.startsWith("/auth/") || clean.startsWith("/api/")) continue;
        const r = await request.get(clean, { maxRedirects: 0, headers: { cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ") } });
        seen.set(clean, r.status());
      }
    }
  };
  await crawl(PUBLIC_PAGES);
  await signIn(context, "pro");
  await crawl(PRO_PAGES);
  const broken = [...seen].filter(([, s]) => s >= 400);
  expect(broken, JSON.stringify(broken)).toEqual([]);
  expect(seen.size).toBeGreaterThan(5);
});

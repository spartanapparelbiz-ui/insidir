/* The app is members only (visitors are sent to log in); every page has the footer and legal links,
 * no internal link 404s, nothing scrolls sideways, and every page is screenshotted at both sizes. */
import { expect, test } from "@playwright/test";
import { dealId, footerOk, MEMBER_PAGES, noHorizontalScroll, PRO_PAGES, PUBLIC_PAGES, shotName, signIn } from "./helpers";

test("the app is for members only: visitors are sent to log in, members without a plan to Get Insidir, and the APIs say no", async ({ page, context }) => {
  for (const path of MEMBER_PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  for (const api of ["/api/moves", "/api/feed", "/api/live", "/api/receipts/csv"]) expect((await page.request.get(api)).status(), api).toBe(401);
  await signIn(context, "freeUs");
  for (const path of ["/feed", "/top"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/start$/);
  }
  expect((await page.request.get("/api/moves")).status()).toBe(401);
});

test("every page: footer disclaimer, privacy and terms links, no sideways scroll, screenshot", async ({ page, context }) => {
  const handcheck = await dealId("Hawks");
  for (const path of [...PUBLIC_PAGES, "/admin"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await footerOk(page);
    await noHorizontalScroll(page);
    const name = path === "/" ? "landing" : path.slice(1).replace(/\//g, "-") + (path === "/admin" ? "-login" : "");
    await page.screenshot({ path: shotName(name, page), fullPage: true });
  }
  await signIn(context, "pro");
  for (const path of [...PRO_PAGES, `/deal/${handcheck}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await footerOk(page);
    await noHorizontalScroll(page);
    const name = path.startsWith("/deal/") ? "deal-pro" : path.slice(1).replace(/\//g, "-") + (path === "/gaps" ? "-pro" : "");
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
        // Members-only pages answer a visitor with a redirect to log in: that's not a broken link.
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

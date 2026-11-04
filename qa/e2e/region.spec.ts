/* A US user never sees a Polymarket link: no links to polymarket.com in any page or payload, on every kept page and a
 * market's own page (Kalshi through its approved twin, or nothing). A non-US member gets Polymarket's link. */
import { expect, test } from "@playwright/test";
import { APP_URL } from "./env";
import { captureBodies, signIn } from "./helpers";

const PM = /https?:\/\/(www\.)?polymarket\.com/;
const PAGES = ["/", "/board", "/election", "/markets", "/markets/tennis", "/wallets", "/pricing", "/results", "/settings", "/copies", "/market/0xe2etennis100"];

for (const who of ["pro", "freeUs", "visitor"] as const) {
  test(`US ${who}: no Polymarket link anywhere`, async ({ page, context }) => {
    if (who !== "visitor") await signIn(context, who);
    // A visitor who hasn't picked a region gets the US set.
    const bodies = await captureBodies(page, async () => {
      for (const path of PAGES) {
        const r = await page.goto(path);
        expect(r?.status(), path).toBeLessThan(400);
        const hrefs = await page.locator("a[href]").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
        expect(hrefs.filter(h => PM.test(h)), path).toEqual([]);
      }
    });
    const hits = bodies.filter(b => PM.test(b.body)).map(b => `${b.url.replace(APP_URL, "")}: ${b.body.match(PM)![0]}`);
    expect(hits).toEqual([]);
  });
}

test("a US member on a twinned market: the Kalshi link only", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/market/0xe2etennis100");
  await expect(page.locator('a[href^="https://kalshi.com/"]').first()).toBeAttached();
  await expect(page.locator('a[href*="polymarket.com"]')).toHaveCount(0);
});

test("a non-US member gets Polymarket's link on the market's page", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/market/0xe2etennis100");
  await expect(page.locator('a[href*="polymarket.com/"]').first()).toBeAttached();
});

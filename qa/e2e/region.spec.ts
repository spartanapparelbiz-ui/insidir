/* A US user never sees international Polymarket: no deals on it, no links to polymarket.com, in any page or
 * payload. A non-US user does see those deals. */
import { expect, test } from "@playwright/test";
import { APP_URL } from "./env";
import { captureBodies, dealId, signIn } from "./helpers";

const INTL = /https?:\/\/(www\.)?polymarket\.com|\(intl\)/;

for (const who of ["pro", "freeUs", "visitor"] as const) {
  test(`US ${who}: no international Polymarket anywhere`, async ({ page, context }) => {
    if (who !== "visitor") await signIn(context, who);
    // A visitor who hasn't picked a region gets the US set.
    const intlFresh = await dealId("Fed cut"), intlOld = await dealId("BTC close");
    const bodies = await captureBodies(page, async () => {
      for (const path of ["/", "/terminal", "/receipts", "/pricing", "/whales", "/settings", `/deal/${intlFresh}`, `/deal/${intlOld}`]) {
        await page.goto(path);
        const hrefs = await page.locator("a[href]").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
        expect(hrefs.filter(h => /polymarket\.com/.test(h)), path).toEqual([]);
      }
      await page.evaluate(() => fetch("/api/feed").then(r => r.text()));
    });
    const hits = bodies.filter(b => INTL.test(b.body)).map(b => `${b.url.replace(APP_URL, "")}: ${b.body.match(INTL)![0]}`);
    expect(hits).toEqual([]);
    // Opening an international deal by its link shows nothing of it.
    await page.goto(`/deal/${intlFresh}`);
    await expect(page.getByText("Will the Fed cut")).toHaveCount(0);
  });
}

test("a non-US member sees international Polymarket deals, US venues stay too", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/terminal");
  await expect(page.getByText("Will the Fed cut").first()).toBeVisible();
  await expect(page.locator('a[href^="https://polymarket.com/"]').first()).toBeAttached();
});

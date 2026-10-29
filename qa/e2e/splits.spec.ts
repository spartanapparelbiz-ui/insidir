/* Splits: smart money vs. the crowd. A split as the worker stores it (lib/smart/store.ts) shows on /splits (members
 * now, free viewers 30 minutes later), on its market's page and on the public scorecard once scored. */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

const ID = "0xe2esplit1";

test.beforeEach(async () => {
  await q("delete from terminal.splits where subject like '0xe2esplit%'");
  await q(`insert into terminal.splits (id, kind, source, subject, title, subtitle, tab, crowd, smart, gap, smart_side, detail, live, first_seen_at, last_seen_at, flagged_at, flagged_crowd, flagged_smart, flagged_gap)
    values ('crowd:${ID}', 'crowd', 'polymarket', '${ID}', 'E2E fixture: Fed cut in December?', 'E2E fixture: Fed in December', 'markets', 0.62, 0.81, 19, 'yes',
      '{"yesLabel":"Yes","noLabel":"No","wallets":4,"smartYes":81000,"smartNo":19000}', true, now() - interval '5 minutes', now(), now() - interval '5 minutes', 0.62, 0.81, 19),
    ('crowd:0xe2esplit2', 'crowd', 'polymarket', '0xe2esplit2', 'E2E fixture: Senate race winner?', null, 'markets', 0.4, 0.2, 20, 'no',
      '{"yesLabel":"Yes","noLabel":"No","wallets":3}', false, now() - interval '9 days', now() - interval '2 days', now() - interval '9 days', 0.4, 0.2, 20)`);
  await q("update terminal.splits set outcome = 'no', smart_right = true, resolved_at = now() - interval '1 day' where subject = '0xe2esplit2'");
});
test.afterAll(async () => { await q("delete from terminal.splits where subject like '0xe2esplit%'"); });

test("members see live splits biggest gap first, linked to the market, with the line both numbers make", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/splits");
  await expect(page.getByRole("heading", { level: 1, name: "Smart money vs. the crowd" })).toBeVisible();
  const row = page.locator(".srow", { hasText: "E2E fixture: Fed cut in December?" });
  await expect(row).toContainText("Crowd 62% · Smart money 81%");
  await expect(row).toContainText("19 pts apart");
  await expect(row).toContainText("4 proven traders");
  // The scored one isn't live any more.
  await expect(page.locator(".srow", { hasText: "Senate race winner" })).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/market/${ID}$`));
  await expect(page.getByRole("heading", { level: 1, name: "E2E fixture: Fed cut in December?" })).toBeVisible();
  const smart = page.locator("#smart-h").locator("xpath=..");
  await expect(page.getByRole("heading", { level: 2, name: "Smart money vs. the crowd" })).toBeVisible();
  await expect(smart).toContainText("19 points apart");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("free viewers see splits 30 minutes late; the scorecard is public and keeps every call", async ({ page }) => {
  await page.goto("/splits");
  await expect(page.getByText("You're seeing splits 30 minutes late.")).toBeVisible();
  await expect(page.locator(".srow", { hasText: "Fed cut in December" })).toHaveCount(0);
  await q(`update terminal.splits set first_seen_at = now() - interval '40 minutes' where subject = '${ID}'`);
  await page.reload();
  await expect(page.locator(".srow", { hasText: "Fed cut in December" })).toBeVisible();

  await page.goto("/splits/scorecard");
  await expect(page.getByRole("heading", { level: 1, name: "Splits scorecard" })).toBeVisible();
  const table = page.getByRole("table", { name: "Flagged splits" });
  await expect(table.getByRole("row", { name: /Senate race winner/ })).toContainText("Smart money right");
  await expect(table.getByRole("row", { name: /Fed cut in December/ })).toContainText("Open");
  await expect(page.locator(".tile", { hasText: "Splits flagged" }).locator("dd")).toHaveText(/^\d+$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

/* The SEC research pages (docs/INSIDIR-V3.md §3): /filings and /insiders, seeded with three real EDGAR filings
 * (qa/e2e/seed.ts). Members only (a visitor and a member without a plan go to /go, the Whop checkout); every row links
 * to its filing on sec.gov; the 4/A is marked and its original's line is left out of insider activity; option
 * exercises have their own tab and never show among open-market trades; the filter form is a plain link. */
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, shotName, signIn } from "./helpers";

for (const path of ["/filings", "/insiders"]) {
  test(`${path}: a visitor and a member without a plan go to the checkout`, async ({ page, context }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/go(\?|$)/);
    await signIn(context, "freeUs");
    await page.goto(path);
    await expect(page).toHaveURL(/\/go(\?|$)/);
  });
}

test("/filings: every Form 4 read, the amendment marked, each linked to sec.gov, searchable", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/filings");
  await expect(page.getByTestId("filings")).toBeVisible();
  await expect(page.getByTestId("sec-coverage")).toContainText("within minutes of reaching EDGAR");
  const rows = page.getByTestId("filings-table").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  const links = page.getByTestId("filings-table").locator('a[href^="https://www.sec.gov/Archives/edgar/data/"]');
  await expect(links).toHaveCount(3);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    expect(await a.getAttribute("href")).toMatch(/\/\d{18}\/\d{10}-\d{2}-\d{6}-index\.htm$/);
  }
  await expect(page.locator('tr[data-form="4/A"]')).toContainText("Amendment");
  await expect(page.locator('tr[data-form="4"]', { hasText: "BCB" })).toContainText("Amended");
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("filings", page), fullPage: true });
  // The search form is a GET: its result is a link.
  await page.getByLabel("Company, ticker or person").fill("procter");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/filings\?q=procter/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("M");
  await page.goto("/filings?code=M");
  await expect(rows).toHaveCount(1);
  await page.goto("/filings?from=2026-13-40&ticker=';drop");
  await expect(rows).toHaveCount(3);
});

test("/insiders: open-market first and alone; exercises in their own tab; the restated line left out", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/insiders");
  const table = page.getByTestId("trades-table");
  const rows = table.locator("tbody tr");
  // BCB's purchase once (from the 4/A that restates the original) and P&G's sale. No exercise.
  await expect(rows).toHaveCount(2);
  await expect(table.locator('tr[data-code="M"]')).toHaveCount(0);
  await expect(table.locator('tr[data-code="P"]')).toContainText("Form 4/A");
  await expect(table.locator('tr[data-code="S"]')).toContainText("Sale");
  await expect(page.getByTestId("sec-totals")).toContainText("Open-market purchases");
  await expect(table.locator('a[href^="https://www.sec.gov/Archives/edgar/data/"]')).toHaveCount(2);
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("insiders", page), fullPage: true });
  await page.getByTestId("insider-tabs").getByRole("link", { name: /Option exercises/ }).click();
  await expect(page).toHaveURL(/tab=exercises/);
  await expect(rows).toHaveCount(2);
  await expect(table.locator('tr[data-code="M"]')).toHaveCount(2);
  await expect(page.getByTestId("sec-totals")).toHaveCount(0);
  await page.goto("/insiders?tab=grants");
  await expect(page.getByTestId("sec-empty")).toBeVisible();
  // A ticker opens that company's report; a ticker filter keeps to its activity.
  await page.goto("/insiders");
  await table.getByRole("link", { name: "PG", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/PG$/);
  await page.goto("/insiders?ticker=PG");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PG");
  await expect(rows).toHaveCount(1);
});

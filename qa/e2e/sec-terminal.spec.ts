/* The SEC research terminal, steps 3–7 (docs/INSIDIR-V3.md §3): the /sec landing, a company report (Procter & Gamble,
 * from its real filings, seeded), People, watchlists with a real alert end to end, and the journal. Members only, every
 * figure and filing linked to sec.gov, the price chart Coming soon. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_DB } from "./env";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";

test("/sec: the terminal's own page, every module listed, the price as the plan says, the chart Coming soon", async ({ page }) => {
  await page.goto("/sec");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("SEC research terminal");
  await expect(page.getByText("Terminal-grade SEC data for $39 a month.")).toBeVisible();
  await expect(page.getByTestId("sec-modules").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("sec-price")).toHaveText("$1 for 3 days, then $39 a month. Cancel any time.");
  await expect(page.getByText("No AI summaries, no price targets, nothing simulated.")).toBeVisible();
  await expect(page.getByTestId("sec-modules")).toContainText("the price chart is coming soon");
  await expect(page.getByTestId("sec-start")).toHaveAttribute("href", "/go");
  // In the bar on desktop, in the burger menu on a phone.
  await expect(page.locator('#b-menu a[href="/sec"], .b-nav-links a[href="/sec"]').first()).toHaveText("SEC terminal");
  await noHorizontalScroll(page);
});

for (const path of ["/company/PG", "/people/1", "/watchlists", "/journal"]) {
  test(`${path}: a member without a plan goes to the checkout`, async ({ page, context }) => {
    await signIn(context, "freeUs");
    await page.goto(path);
    await expect(page).toHaveURL(/\/go(\?|$)/);
  });
}

test("company report: header, TTM financials each linked to its filing, 8-K items, insiders, chart Coming soon", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/company/pg");
  await expect(page).toHaveURL(/\/company\/PG$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PROCTER & GAMBLE Co · PG");
  await expect(page.getByTestId("company-meta")).toContainText("June 30");
  await expect(page.getByText("A delayed price chart, once its prices come from a licensed source.")).toBeVisible();
  const rev = page.locator('[data-testid="financials"] tr[data-metric="revenue"]');
  await expect(rev).toHaveAttribute("data-basis", "ttm");
  await expect(rev).toContainText("$87,922M");
  await expect(rev).toContainText("12 months to Sep 30, 2026");
  await expect(rev.locator('a[href^="https://www.sec.gov/Archives/edgar/data/80424/"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="financials"] tr[data-metric="epsDiluted"]')).toContainText("$6.62");
  await page.getByRole("link", { name: "8-K", exact: true }).click();
  await expect(page).toHaveURL(/filings=current/);
  // P&G's real 8-K of Nov 3, 2026 (items 8.01 and 9.01).
  await expect(page.locator('[data-testid="company-filings"] tr[data-form="8-K"]', { hasText: "Nov 3, 2026" }).first()).toContainText("8.01 Other events · 9.01 Financial statements and exhibits");
  await expect(page.getByTestId("company-insiders")).toContainText("Andre Schulten");
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("company", page), fullPage: true });
  await expect(page.getByTestId("journal-panel")).toBeVisible();
  // An unknown ticker is a 404, never someone else's page.
  expect((await page.request.get("/company/ZZZZQ")).status()).toBe(404);
});

test("People: every company on their filings, their relationship as filed, linked to the filing", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/company/PG");
  await page.getByTestId("company-insiders").getByRole("link", { name: "Andre Schulten" }).click();
  await expect(page).toHaveURL(/\/people\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Andre Schulten");
  const seats = page.getByTestId("person-seats").locator("tbody tr");
  await expect(seats).toHaveCount(1);
  await expect(seats.first()).toContainText("Chief Financial Officer");
  await expect(seats.first().locator('a[href^="https://www.sec.gov/Archives/edgar/data/80424/"]')).toHaveCount(1);
  await expect(page.getByTestId("trades-table").locator('tr[data-code="S"]')).toHaveCount(1);
});

test("watchlists: add a company, a new 8-K becomes an alert with its speed, mark read", async ({ page, context }) => {
  // A clean slate whatever an earlier run left.
  await q("delete from terminal.sec_watchlists where user_id = 'user_e2e_insidir'");
  await q("delete from terminal.sec_alerts where user_id = 'user_e2e_insidir'");
  await q("delete from terminal.company_filings where accession = '000162828026888888'");
  await signIn(context, "insidir");
  await page.goto("/company/PG");
  await page.getByTestId("watch-form").getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByTestId("watch-form")).toContainText("Added");
  await page.goto("/watchlists");
  const list = page.getByTestId("watchlist").first();
  await expect(list).toContainText("PROCTER & GAMBLE Co (PG)");
  await list.getByLabel("8-K current reports").check();
  await expect(list.getByLabel("8-K current reports")).toBeChecked();
  await expect(page.getByText("Saved.")).toBeVisible();
  // The worker's part: a new 8-K seen a minute after EDGAR accepted it, then the alert job.
  await q(`insert into terminal.company_filings (accession, cik, form, filed_on, accepted_at, url, seen_at)
    values ('000162828026888888', '80424', '8-K', to_char(now(), 'YYYY-MM-DD'), now() - interval '90 seconds', 'https://www.sec.gov/Archives/edgar/data/80424/000162828026888888/x.htm', now() - interval '30 seconds')
    on conflict do nothing`);
  const run = JSON.parse(execFileSync("npx", ["tsx", join(__dirname, "run-sec-alerts.ts")], { env: { ...process.env, DATABASE_URL: E2E_DB }, encoding: "utf8" }).trim().split("\n").at(-1)!) as { made: number };
  expect(run.made).toBe(1);
  await page.reload();
  await expect(page.getByTestId("unread-badge")).toHaveText("1");
  const row = page.getByTestId("alerts").locator('tr[data-unread="1"]');
  await expect(row).toContainText("8-K · PROCTER & GAMBLE Co (PG)");
  await expect(row).toContainText(/\d+ min after EDGAR|\d+s after EDGAR/);
  await expect(row.locator('a[href^="https://www.sec.gov/"]')).toHaveCount(1);
  await page.getByTestId("mark-read").click();
  await expect(page.getByTestId("unread-badge")).toHaveCount(0);
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("watchlists", page), fullPage: true });
  await q("delete from terminal.sec_watchlists where user_id = 'user_e2e_insidir'");
  await q("delete from terminal.sec_alerts where user_id = 'user_e2e_insidir'");
  await q("delete from terminal.company_filings where accession = '000162828026888888'");
});

test("journal: a status and a private note on a company, listed on /journal, nobody else sees it", async ({ page, context, browser }) => {
  await q("delete from terminal.journal_entries where user_id in ('user_e2e_insidir', 'user_e2e_pro')");
  await signIn(context, "insidir");
  await page.goto("/company/PG");
  const panel = page.getByTestId("journal-panel");
  await panel.getByLabel("Status").selectOption("watching");
  await panel.getByLabel("Private note").fill("Margins after the price increases.");
  await panel.getByRole("button", { name: "Save to journal" }).click();
  await expect(panel).toContainText("Only you can see this.");
  await page.goto("/journal");
  const row = page.getByTestId("journal-table").locator('tr[data-status="watching"]');
  await expect(row).toContainText("PROCTER & GAMBLE Co");
  await expect(row).toContainText("Margins after the price increases.");
  const other = await browser.newContext();
  await signIn(other, "pro");
  const p2 = await other.newPage();
  await p2.goto("/journal");
  await expect(p2.getByTestId("journal-empty")).toBeVisible();
  await other.close();
  await q("delete from terminal.journal_entries where user_id = 'user_e2e_insidir'");
});

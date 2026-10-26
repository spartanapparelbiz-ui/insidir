/* The pro Terminal and the Receipts ledger: keyboard navigation (J / K / Enter / Esc / /), the drawer opening and
 * closing, timers that survive a refresh, blurred cells that carry no real values in the DOM, and a CSV export that
 * downloads valid data matching the table. Both sizes. */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CSV_HEADER } from "@/lib/ledger";
import { q, signIn } from "./helpers";

// First-visit tips sit over the table; these tests are about the table itself.
const noTips = (page: Page) => page.addInitScript(() => { try { localStorage.setItem("insidir_tips_done", "1"); } catch { /* ignore */ } });

test("Terminal keyboard: J/K move, Enter opens the drawer, Esc closes it, / jumps to search", async ({ page, context }) => {
  await signIn(context, "pro");
  await noTips(page);
  await page.goto("/terminal");
  const rows = page.locator("tr[data-deal]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);
  await page.locator("h1").click();
  await page.keyboard.press("j");
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("j");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("#dsheet-h")).toHaveText(await rows.nth(0).locator("th").locator(".dt-link").innerText());
  await expect(drawer.getByText(/Open on /).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
});

test("Terminal drawer opens on click and closes from its button", async ({ page, context }) => {
  await signIn(context, "pro");
  await noTips(page);
  await page.goto("/terminal");
  await page.locator("tr[data-deal]").first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("img", { name: /^Spend .* get 1 dollar back/ }).first()).toBeVisible(); // the $1 bar
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);
});

test("Terminal timers count from when the deal was found: a refresh doesn't reset them", async ({ page, context }) => {
  await signIn(context, "pro");
  await noTips(page);
  await page.goto("/terminal");
  const cell = page.locator("tr[data-deal] td.dt-c-open").first();
  const secs = async () => { const m = (await cell.innerText()).match(/(\d+)m (\d+)s/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
  test.skip((await cell.isVisible()) === false, "Open for column is hidden on phones");
  const before = await secs();
  expect(before).toBeGreaterThan(0);
  await page.reload();
  expect(await secs()).toBeGreaterThanOrEqual(before);
});

test("free Terminal: paid cells are lock bars with no real values anywhere in the DOM", async ({ page, context }) => {
  await signIn(context, "freeUs");
  await noTips(page);
  await page.goto("/terminal");
  await expect(page.locator(".freebar")).toContainText("You're seeing deals 30 min late");
  await expect(page.locator(".freebar [data-unlock]")).toBeVisible();
  const rows = page.locator("tr[data-deal]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.locator(".lockbar").count()).toBeGreaterThan(0);
  const html = await page.content();
  const seeded = await q<{ id: string; data: { profit: number; cost: number; fees: number; profitPerDay: number } }>("select id, data from terminal.opportunities where active");
  for (const s of seeded) {
    for (const v of [s.data.profit, s.data.cost + s.data.fees, s.data.profitPerDay]) {
      if (!(v > 0)) continue;
      expect(html, `${s.id} leaks ${v}`).not.toContain(`$${v.toFixed(2)}`);
    }
  }
});

test("Receipts: CSV export downloads valid data that matches the table; rows expand by keyboard", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/receipts?period=30d");
  await expect(page.locator("h1")).toHaveText("Receipts: every deal we've ever flagged.");
  const ids = await page.locator("tr[data-receipt]").evaluateAll(trs => trs.map(t => t.getAttribute("data-receipt")));
  expect(ids.length).toBeGreaterThan(5);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  expect(download.suggestedFilename()).toBe("receipts.csv");
  const csv = readFileSync((await download.path())!, "utf8");
  const lines = csv.trimEnd().split("\r\n");
  expect(lines[0]).toBe(CSV_HEADER.join(","));
  const csvIds = lines.slice(1).map(l => l.split(",")[0]);
  expect(csvIds.slice(0, ids.length)).toEqual(ids);
  for (const l of lines.slice(1)) expect(l).toMatch(/^R-\d{6},\d{4}-\d{2}-\d{2}T/);
  // A miss is listed with the same weight as a win.
  await expect(page.locator("td.rx-out--differently").first()).toContainText("Settled differently");
  const toggle = page.locator("tr[data-receipt] .rx-toggle").first();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".rx-detail").first()).toContainText("Contracts");
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("Receipts filters: a filter that matches nothing says so and offers to clear it", async ({ page }) => {
  await page.goto("/receipts?result=differently&from=2001-01-01&to=2001-01-02");
  await expect(page.getByText("No receipts match these filters")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" }).first()).toBeVisible();
});

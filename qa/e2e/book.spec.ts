/* The Book end to end (/book): a pushed Autopilot match waits for "placed or skipped?"; marked placed at the member's
 * fill it joins the Book with a copy; open at Kalshi's price, settled at the member's own price, losses included; a fill
 * corrected; the daily push time saved; the CSV and the monthly statement PDF download. Seeded rows; members only. */
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";

const U = "user_e2e_pro_intl";
const clean = async () => {
  await q("delete from terminal.autopilot_matches where user_id = $1", [U]);
  await q("delete from terminal.bet_copies where user_id = $1", [U]);
  await q("update terminal.users set settings = settings - 'bookPushAt' where id = $1", [U]);
};

test.beforeAll(async () => {
  await clean();
  const row = `insert into terminal.autopilot_matches (rule_id, user_id, wallet, market_id, kalshi_id, kalshi_url, side, outcome, title, category, amount, their_price, event_id, status,
    ask, limit_price, contracts, stake, paper_entry, trade_at, matched_at, latency_ms, result, settled_at, member_status, fill_price) values
    (1, $1, '0x1', '0xbook1', 'KXBOOK-1', 'https://kalshi.com/markets/kxbook', 'yes', $2, $3, $4, 60000, 0.6, $5, 'sent', 0.62, 0.62, 40, 24.8, 0.63,
     now() - interval '2 hours', now() - interval '2 hours', 6000, $6, $7, $8, $9)`;
  await q(row, [U, "Rangers", "Rangers vs. Devils", "hockey", "pm:book-wait", null, null, null, null]);
  await q(row, [U, "Heat", "Heat vs. Lakers", "basketball", "pm:book-won", "won", new Date(Date.now() - 3_600_000), "placed", 0.6]);
  await q(row, [U, "Bills", "Bills vs. Jets", "football", "pm:book-lost", "lost", new Date(Date.now() - 3_600_000), "placed", null]);
});
test.afterAll(clean);

test("a visitor is sent to log in", async ({ page }) => {
  await page.goto("/book");
  await expect(page).toHaveURL(/\/login\?next=%2Fbook/);
});

test("placed or skipped, open and settled with losses, a corrected fill, the daily push, CSV and the statement", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context, "proIntl");
  await page.goto("/book");
  // Settled: Heat won at 60¢ (40 × $1 − $24 = +$16), Bills lost at the 62¢ limit (−$24.80).
  await expect(page.getByTestId("book-settled")).toHaveText("1 won · 1 lost");
  await expect(page.getByTestId("book-net")).toHaveText("−$8.80");
  await expect(page.getByTestId("book-winrate")).toHaveText("50%");
  await expect(page.locator('[data-testid="book-row"][data-state="lost"]')).toContainText("−$24.80");
  await expect(page.getByTestId("book-pending-row")).toHaveCount(1);
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("book", page), fullPage: true });

  // Placed, at 63¢.
  const wait = page.getByTestId("book-pending-row");
  await wait.getByLabel("Fill (¢)").fill("63");
  await wait.getByTestId("book-placed").click();
  await expect(page.getByTestId("book-notice")).toHaveText("Marked placed. It's in your Book.");
  await expect(page.getByTestId("book-pending-row")).toHaveCount(0);
  await expect(page.getByTestId("book-open")).toHaveText("1");
  await expect(page.getByTestId("book-exposure")).toHaveText("$25.20");
  await expect(page.getByTestId("book-cat")).toContainText("Hockey");

  // Correct the Bills fill to 55¢: the loss is now −$22.
  const bills = page.locator('[data-testid="book-row"][data-state="lost"]');
  await bills.locator("summary").click();
  await bills.getByLabel("Your fill (¢)").fill("55");
  await bills.getByTestId("book-fill-save").click();
  await expect(page.locator('[data-testid="book-row"][data-state="lost"]')).toContainText("−$22");

  // The daily push.
  await page.getByTestId("book-push").getByLabel("Daily summary push at").fill("08:30");
  await page.getByTestId("book-push").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Every day at 08:30, your time.")).toBeVisible();

  // Exports.
  const csv = await page.request.get("/api/book/csv");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const lines = (await csv.text()).trim().split("\n");
  expect(lines).toHaveLength(4);
  expect(lines.some(l => l.includes("Bills vs. Jets") && l.includes(",lost,") && l.includes("-22.00"))).toBe(true);
  const month = new Date().toISOString().slice(0, 7);
  const pdf = await page.request.get(`/api/book/statement?month=${month}`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get("/api/book/statement?month=2026-13")).status()).toBe(400);
});

test("exports are members only", async ({ page }) => {
  expect((await page.request.get("/api/book/csv")).status()).toBe(401);
});

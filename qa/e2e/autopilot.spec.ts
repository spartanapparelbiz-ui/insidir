/* Autopilot end to end (/autopilot, /t/[id]): the three starter rules with their backtests turn on in one tap; a rule
 * built from plain controls saves and reads back in one line; the log shows a pushed match and a "too late" skip with
 * its reason; the ticket shows the finished Kalshi bet and how long after the trade it was sent; toggling and
 * deleting work; only its member sees a ticket; visitors are sent to log in. The engine itself is covered in
 * test/autopilot.test.ts; here its rows are seeded. */
import { expect, test } from "@playwright/test";
import { specKey } from "@/lib/autopilot/backtest";
import { STARTERS } from "@/lib/autopilot/starters";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";

const U = "user_e2e_insidir";
let sentId = 0;

test.beforeAll(async () => {
  await q("delete from terminal.autopilot_matches where user_id = any($1)", [[U, "user_e2e_pro"]]);
  await q("delete from terminal.autopilot_rules where user_id = any($1)", [[U, "user_e2e_pro"]]);
  const bt = { days: 180, from: Date.now() - 178 * 86_400_000, to: Date.now(), bets: 41, won: 23, lost: 17, void: 0, open: 1, staked: 1020, net: 212.4, roi: 0.208, winRate: 23 / 40, tooLate: 9, capped: 2, maxDrawdown: 140, curve: [] };
  for (const s of STARTERS) await q("insert into terminal.autopilot_backtests (key, result, computed_at) values ($1, $2, now()) on conflict (key) do update set result = excluded.result, computed_at = now()", [specKey(s.spec), JSON.stringify(bt)]);
  const [rule] = await q<{ id: number }>("insert into terminal.autopilot_rules (user_id, name, spec) values ($1, 'Lakers games', $2) returning id",
    [U, JSON.stringify({ ...STARTERS[0]!.spec, markets: { ...STARTERS[0]!.spec.markets, races: ["Lakers"] } })]);
  const base = [rule!.id, U, "0x" + "1".repeat(40), "0xe2emilnba", "KXNBAGAME-26NOV04MIALAL-MIA", "https://kalshi.com/markets/kxnbagame", "yes", "Heat", "Heat vs. Lakers", "basketball", 60000, 0.61];
  const [m] = await q<{ id: number }>(`insert into terminal.autopilot_matches (rule_id, user_id, wallet, market_id, kalshi_id, kalshi_url, side, outcome, title, category, amount, their_price,
      event_id, status, ask, limit_price, contracts, stake, paper_entry, trade_at, matched_at, latency_ms)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pm:e2e-sent', 'sent', 0.62, 0.62, 40, 24.8, 0.63, now() - interval '10 minutes 6 seconds', now() - interval '10 minutes', 6000) returning id`, base);
  sentId = m!.id;
  await q(`insert into terminal.autopilot_matches (rule_id, user_id, wallet, market_id, kalshi_id, kalshi_url, side, outcome, title, category, amount, their_price,
      event_id, status, reason, ask, trade_at, matched_at, latency_ms)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pm:e2e-late', 'skipped', 'Skipped: they paid 61¢, Kalshi is 70¢ now', 0.7, now() - interval '5 minutes', now() - interval '5 minutes', 4000)`, base);
});

test.afterAll(async () => {
  await q("delete from terminal.autopilot_matches where user_id = any($1)", [[U, "user_e2e_pro"]]);
  await q("delete from terminal.autopilot_rules where user_id = any($1)", [[U, "user_e2e_pro"]]);
});

test("a visitor is sent to log in", async ({ page }) => {
  await page.goto("/autopilot");
  await expect(page).toHaveURL(/\/login\?next=%2Fautopilot/);
});

test("starters with backtests turn on in one tap; a built rule reads back in one line; the log and the ticket", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context, "insidir");
  await page.goto("/autopilot");
  await expect(page.getByTestId("ap-starter")).toHaveCount(3);
  await expect(page.getByTestId("ap-backtest").first()).toHaveText("Last 180 days: 41 trades: 23 won, 17 lost, 1 open. Net +$212 on $1,020 staked (+21%). Worst drop −$140.");
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("autopilot", page), fullPage: true });

  // One tap.
  const two = page.locator('[data-testid="ap-starter"][data-key="consensus"]');
  await two.getByTestId("ap-turn-on").click();
  await expect(page.getByTestId("ap-notice")).toHaveText("Two agree is on.");
  await expect(page.locator('[data-testid="ap-starter"][data-key="consensus"]')).toHaveAttribute("data-on", "1");
  await expect(page.getByTestId("ap-rule").filter({ hasText: "Two agree" })).toContainText("Proven wallets · trades of $10K+ · 2+ wallets agree · up to 85¢ · $25 a trade");

  // Build one.
  await page.getByTestId("ap-new").locator("summary").click();
  const f = page.getByTestId("rule-form");
  await f.getByLabel("Name").fill("NBA big");
  await f.getByLabel("NBA").check();
  await f.getByLabel("Their trade is at least").selectOption("50000");
  await f.getByLabel("Never pay more than (¢)").fill("70");
  await f.getByTestId("rule-form-save").click();
  await expect(page.getByTestId("ap-notice")).toHaveText("Saved.");
  const nba = page.getByTestId("ap-rule").filter({ hasText: "NBA big" });
  await expect(nba).toContainText("Proven wallets · trades of $50K+ · NBA · up to 70¢ · $25 a trade");
  await expect(nba.getByTestId("ap-paper")).toHaveText("No matches yet. Its paper portfolio starts with the first one.");

  // Off, then deleted.
  await nba.getByTestId("ap-toggle").click();
  await expect(page.getByTestId("ap-rule").filter({ hasText: "NBA big" })).toHaveAttribute("data-active", "0");
  await page.getByTestId("ap-rule").filter({ hasText: "NBA big" }).getByTestId("ap-delete").click();
  await expect(page.getByTestId("ap-rule").filter({ hasText: "NBA big" })).toHaveCount(0);

  // The log: the pushed match and the skip, with its reason.
  await expect(page.locator('[data-testid="ap-log-row"][data-status="skipped"]')).toContainText("Skipped: they paid 61¢, Kalshi is 70¢ now");
  const sent = page.locator('[data-testid="ap-log-row"][data-status="sent"]');
  await expect(sent).toContainText("40 at 62¢ limit · Lakers games · Sent 6s after the trade");
  await expect(page.getByTestId("ap-rule").filter({ hasText: "Lakers games" }).getByTestId("ap-paper")).toHaveText("Paper portfolio: 1 match · 1 open.");

  // The ticket.
  await sent.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/t/${sentId}$`));
  await expect(page.getByTestId("ticket-side")).toHaveText("Heat · Yes");
  await expect(page.getByTestId("ticket-limit")).toHaveText("62¢");
  await expect(page.getByTestId("ticket-contracts")).toHaveText("40");
  await expect(page.getByTestId("ticket-sent")).toContainText("Sent 6s after the trade");
  await expect(page.getByTestId("ticket-open")).toHaveAttribute("href", "https://kalshi.com/markets/kxnbagame");
  await noHorizontalScroll(page);
  await page.screenshot({ path: shotName("ticket", page), fullPage: true });
});

test("only its member sees a ticket", async ({ page, context }) => {
  await signIn(context, "pro");
  const r = await page.goto(`/t/${sentId}`);
  expect(r?.status()).toBe(404);
});

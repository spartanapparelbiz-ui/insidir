/* The calculator at $500 on the hand-checked deal (YES Kalshi 55¢ + NO Polymarket US 40¢, 100 fillable sets)
 * shows exactly what the unit math says: capped at 100 sets, $97.94 in, $100 back, $2.06 profit. */
import { expect, test } from "@playwright/test";
import { calculate } from "@/lib/calculator";
import type { Opportunity } from "@/lib/types";
import { dealId, q, signIn } from "./helpers";

test("calculator at $500 matches the unit math", async ({ page, context }) => {
  await signIn(context, "pro");
  const id = await dealId("Hawks");
  const opp = (await q<{ data: Opportunity }>("select data from terminal.opportunities where id = $1", [id]))[0]!.data;
  const expected = calculate({
    legs: opp.legs.map(l => ({ label: l.label, venue: l.venue, side: l.side, avgPrice: l.avgPrice, fee: l.venue === "kalshi" ? { venue: "kalshi", multiplier: 1 } : { venue: l.venue, rate: 0.05 } })),
    payoutPerSet: opp.payout / opp.sets, maxSets: opp.sets,
  }, 500);
  // The hand-checked numbers (test/handcheck.test.ts).
  expect(expected.sets).toBe(100);
  expect(expected.total).toBeCloseTo(97.94, 2);
  expect(expected.profit).toBeCloseTo(2.06, 2);

  await page.goto(`/deal/${id}`);
  const calc = page.locator("section.calc");
  await calc.getByLabel("Amount ($)").fill("500");
  const kv = (k: string) => calc.locator("dl.kv div", { hasText: k }).locator("dd");
  await expect(kv("Total cost")).toHaveText("$97.94");
  await expect(kv("Payout")).toHaveText("$100.00");
  await expect(kv("Net P&L")).toHaveText("$2.06");
  await expect(calc.getByText("Capped at the 100 sets")).toBeVisible();
  await expect(calc.locator("tbody tr")).toHaveCount(2);
  await expect(calc.locator("tbody tr").first()).toContainText("100");
  await expect(page.getByText(/you should (buy|bet)/i)).toHaveCount(0);
  await calc.screenshot({ path: `qa/screenshots/calculator-500-${page.viewportSize()!.width}.png` });
});

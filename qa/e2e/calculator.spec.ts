/* The hand-checked deal (YES Kalshi 55¢ + NO Polymarket US 40¢, 100 fillable sets), both views.
 * Simple view: "Show me how" starts at $95 in → $100 back, keep $2.06, and caps a $500 amount at what the deal takes.
 * Pro view: the calculator at $500 shows exactly what the unit math says: capped at 100, $97.94 in, $100 back,
 * $2.06 kept. */
import { expect, test } from "@playwright/test";
import { calculate } from "@/lib/calculator";
import type { Opportunity } from "@/lib/types";
import { dealId, q, setView, signIn } from "./helpers";

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

  // Simple view (the default): the walkthrough.
  await setView(page, "simple");
  await page.goto(`/deal/${id}`);
  const how = page.locator("section.how");
  await expect(how.getByLabel("How much do you want to put in?")).toHaveValue("95");
  await expect(how.locator(".how__step").nth(0)).toContainText("Open Kalshi and buy YES");
  await expect(how.locator(".how__step").nth(0)).toContainText("Spend $55.");
  await expect(how.locator(".how__step").nth(1)).toContainText("Spend $40.");
  await expect(how.locator(".how__step").nth(2)).toContainText("one side pays you $100. You keep about $2.06.");
  await how.getByLabel("How much do you want to put in?").fill("500");
  await expect(how.getByText("This deal only works up to $95 right now, so we used that.")).toBeVisible();
  await how.screenshot({ path: `qa/screenshots/show-me-how-500-${page.viewportSize()!.width}.png` });

  // Pro view: the calculator.
  await setView(page, "pro");
  await page.goto(`/deal/${id}`);
  const calc = page.locator("section.calc");
  await calc.getByLabel("Amount ($)").fill("500");
  const kv = (k: string) => calc.locator("dl.kv div", { hasText: k }).locator("dd");
  await expect(kv("You pay")).toHaveText("$97.94");
  await expect(kv("You get back")).toHaveText("$100.00");
  await expect(kv("You keep")).toHaveText("$2.06");
  await expect(calc.getByText("Capped at 100 shares a side")).toBeVisible();
  await expect(calc.locator("tbody tr")).toHaveCount(2);
  await expect(calc.locator("tbody tr").first()).toContainText("100");
  await expect(page.getByText(/you should (buy|bet)/i)).toHaveCount(0);
  await calc.screenshot({ path: `qa/screenshots/calculator-500-${page.viewportSize()!.width}.png` });
  await setView(page, "simple");
});

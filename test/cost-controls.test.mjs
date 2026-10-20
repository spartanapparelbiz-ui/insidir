/* Cost controls: spend alerts, the "important update" rule, figure checks on SEC relationship names. */
import test from "node:test";
import assert from "node:assert/strict";
import { spendAlerts } from "../src/ops.mjs";
import { isImportant, IMPORTANT_SALE_USD } from "../src/notifications.mjs";
import { unsupportedFigures } from "../src/compliance-guard.mjs";
import { aiLimits } from "../src/ai-gateway.mjs";

test("spend alerts: 80% warns, the whole budget stops, refusals are reported", () => {
  const base = { dailyBudgetUsd: 2, monthlyBudgetUsd: 25, spentTodayUsd: 0, spentMonthUsd: 0, refusalsToday: [] };
  assert.deepEqual(spendAlerts(base), []);
  assert.match(spendAlerts({ ...base, spentTodayUsd: 1.7 })[0].detail, /today at 85% of budget/);
  assert.match(spendAlerts({ ...base, spentMonthUsd: 25 })[0].detail, /this month reached: \$25\.00 of \$25\.00/);
  assert.match(spendAlerts({ ...base, refusalsToday: [{ budget: "user_monthly_budget", n: 3 }] })[0].detail, /3 AI request\(s\) refused.*user_monthly_budget 3/);
  assert.deepEqual(spendAlerts({ unavailable: "x" }), []);
});

test("defaults: the per-customer monthly allowance is the $0.25 target; escalation stops at half of any budget", () => {
  const L = aiLimits({});
  assert.equal(L.userMonthlyBudgetUsd, 0.25); assert.equal(L.escalateBelow, 0.5); assert.equal(L.userMonthly, 300);
  assert.equal(aiLimits({ INSIDIR_AI_USER_MONTHLY_BUDGET_USD: "999" }).userMonthlyBudgetUsd, 50, "clamped");
});

test("important updates: purchases, clustered purchases, disclosures, and sales of $1,000,000 or more as filed", () => {
  assert.equal(isImportant({ event_type: "insider_purchase", facts: { totalValue: "1" } }), true);
  assert.equal(isImportant({ event_type: "multi_insider_purchase" }), true);
  assert.equal(isImportant({ event_type: "company_disclosure" }), true);
  assert.equal(isImportant({ event_type: "insider_sale", facts: { totalValue: String(IMPORTANT_SALE_USD) } }), true);
  assert.equal(isImportant({ event_type: "insider_sale", facts: { totalValue: "273024" } }), false);
  assert.equal(isImportant({ event_type: "insider_sale", facts: { totalValue: null } }), false, "no value as filed: not assumed large");
  assert.equal(isImportant({ event_type: "form4_amendment" }), false);
});

test("'10% owner' is a Form 4 relationship, not an unsupported figure", () => {
  assert.deepEqual(unsupportedFigures("CHS GP LP, a 10% owner, reported 2,495,391 shares.", ["2495391 shares; isTenPercentOwner"]), []);
  assert.deepEqual(unsupportedFigures("Shares rose 10% after the filing.", ["2495391 shares"]), ["10%"], "a real percentage still needs a source");
});

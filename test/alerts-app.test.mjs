import test from "node:test";
import assert from "node:assert/strict";
import { alertSentence } from "../src/alerts-app.mjs";

/* The Alerts inbox's one-sentence summaries (src/alerts-app.mjs). Fixtures are fictional; statements stay factual. */
const line = extra => ({ owner_name: "DOE JANE", role: "director", transaction_code: "P", estimated_value: "943000", rule_10b5_1: false, ...extra });

test("an alert is one factual sentence: who, their role, what they did, how much, which stock", () => {
  assert.equal(alertSentence({ ticker: "EXMP", type: "insider_purchase" }, line()), "Jane Doe, a director, bought $943K of EXMP.");
  assert.equal(alertSentence({ ticker: "EXMP", type: "insider_sale" }, line({ role: "CEO", transaction_code: "S", estimated_value: "2100000" })), "Jane Doe, the CEO, sold $2.1M of EXMP.");
  assert.equal(alertSentence({ ticker: "SMPL", type: "insider_sale" }, line({ transaction_code: "S", rule_10b5_1: true })), "Jane Doe, a director, sold $943K of SMPL under a pre-set plan.", "a 10b5-1 sale says it was planned");
  assert.equal(alertSentence({ ticker: "EXMP", type: "insider_purchase" }, line({ role: null, estimated_value: null })), "Jane Doe bought shares of EXMP.");
  assert.equal(alertSentence({ ticker: "PLHD", type: "multi_insider_purchase", transactionDate: "2026-10-01", transactionDateEnd: "2026-10-04", facts: { distinctReportingOwners: 2, totalValue: 3100000 } }, null),
    "2 insiders bought $3.1M of PLHD within 4 days.");
  assert.equal(alertSentence({ ticker: "EXMP", type: "insider_purchase" }, null), null, "no line, no sentence: the engine's own headline is shown");
  for (const s of [alertSentence({ ticker: "EXMP" }, line()), alertSentence({ ticker: "EXMP" }, line({ transaction_code: "S" }))])
    assert.doesNotMatch(s, /illegal|suspicious|wrongdoing|tip|ahead of/i);
});

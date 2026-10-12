import test from "node:test";
import assert from "node:assert/strict";
import { validateResearchDecision } from "../src/research.mjs";

test("research review keeps explicit user decision without generating an order", () => {
  assert.deepEqual(validateResearchDecision({reviewStatus:"researching", notes:"  Check Form 4 code  "}),
    {reviewStatus:"researching",notes:"Check Form 4 code"});
  assert.deepEqual(validateResearchDecision({reviewStatus:"passed"}),
    {reviewStatus:"passed",notes:""});
});
test("research review rejects trade-like or malformed statuses", () => {
  for (const x of ["buy","sell","execute","autopilot","",null,3]) {
    assert.throws(() => validateResearchDecision({reviewStatus:x}), {status:400});
  }
  assert.throws(() => validateResearchDecision({reviewStatus:"watching",notes:{secret:"token"}}), {status:400});
  assert.throws(() => validateResearchDecision({reviewStatus:"watching",notes:"x".repeat(1501)}), {status:400});
  assert.throws(() => validateResearchDecision([]), {status:400});
});

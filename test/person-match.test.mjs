import test from "node:test";
import assert from "node:assert/strict";
import { samePerson, isEntityName, displaySecName, naturalNameReadings, givenVariants } from "../src/person-match.mjs";

test("samePerson accepts the same person across SEC and natural name orders", () => {
  for (const [sec, natural] of [
    ["HUANG JEN HSUN", "Jensen Huang"], ["COOK TIMOTHY D", "Tim Cook"], ["NORA JOHNSON SUZANNE M", "Suzanne Nora Johnson"],
    ["SIEVERT G MICHAEL", "Mike Sievert"], ["Mattson W Patrick", "W. Patrick Mattson"], ["MATTSON W PATRICK", "Patrick Mattson"],
    ["BEZOS JEFFREY P", "Jeff Bezos"], ["KRESS COLETTE", "Colette M. Kress"], ["O'BRIEN DEIRDRE", "Deirdre O’Brien"]
  ]) assert.equal(samePerson(sec, natural), true, sec + " / " + natural);
});

test("samePerson rejects different people and entities", () => {
  for (const [sec, natural] of [
    ["RUSSELL DAVID ERIC", "David O. Russell"], ["MATTSON W PATRICK", "J. Patrick Mattson"], ["SMITH JOHN A", "John B. Smith"],
    ["SMITH JOHN", "Jane Smith"], ["BERKSHIRE HATHAWAY INC", "Berkshire Hathaway"], ["COOK TIMOTHY D", "Tim Cooke"]
  ]) assert.equal(samePerson(sec, natural), false, sec + " / " + natural);
  assert.equal(isEntityName("VANGUARD GROUP INC"), true);
  assert.equal(isEntityName("HUANG JEN HSUN"), false);
});

test("natural readings treat a leading initial as a middle name", () => {
  assert.deepEqual(naturalNameReadings("W. Patrick Mattson")[0], { surname: "MATTSON", given: "PATRICK", middles: ["W"] });
  assert.ok(givenVariants("timothy").includes("TIM"));
  assert.equal(displaySecName("COOK TIMOTHY D"), "Timothy D. Cook");
});

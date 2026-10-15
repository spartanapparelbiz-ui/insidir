import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOwnershipFiling, summarizePeople, ownerSummary } from "../src/insiders.mjs";

/* The company report's insider activity (src/insiders.mjs): every reporting owner of a joint Form 4 is
 * on its activity row with their CIK and role, and each one is on the People list (keyed by CIK), so
 * a co-filer such as a fund's controlling person is reachable from the company report. Fictional. */
const FILING = { accession: "0001193125-26-000001", form: "4", filedAt: "2026-10-01", viewUrl: "https://www.sec.gov/x", xmlUrl: "https://www.sec.gov/x.xml" };
const sale = { transactionDate: "2026-09-29", code: "S", acquiredDisposed: "D", derivative: false, shares: 1000, pricePerShare: 10, estimatedValue: 10000, sharesAfter: 5000, category: "reported_sale" };
const jointParsed = {
  owners: [
    { name: "BX EXAMPLE GP LLC", cik: "0001870640", isTenPercentOwner: true },
    { name: "Example Holdings L.P.", cik: "0001870641", isTenPercentOwner: true },
    { name: "DOE  JANE A", cik: "0001070844", isDirector: true, isTenPercentOwner: true },
    { name: "NO CIK TRUST", cik: null, otherText: "Trust" },
    { name: "ZERO", cik: "0000000000" }
  ],
  transactions: [sale]
};

test("activity rows list every reporting owner with CIK and role; owner stays the first one", () => {
  const row = summarizeOwnershipFiling(jointParsed, FILING);
  assert.equal(row.owner.name, "BX EXAMPLE GP LLC");
  assert.equal(row.owner.cik, "0001870640");
  assert.equal(row.joint, true);
  assert.deepEqual(row.owners.map(o => [o.name, o.cik, o.role, o.entity]), [
    ["BX EXAMPLE GP LLC", "0001870640", "10% owner", true],
    ["Example Holdings L.P.", "0001870641", "10% owner", true],
    ["DOE JANE A", "0001070844", "Director · 10% owner", false],
    ["NO CIK TRUST", null, "Trust", true],
    ["ZERO", null, null, false]
  ], "in filing order; an all-zero or missing CIK is null");
  assert.deepEqual(row.additionalOwners, ["Example Holdings L.P.", "DOE  JANE A", "NO CIK TRUST", "ZERO"], "kept for older clients");
  const single = summarizeOwnershipFiling({ owners: [jointParsed.owners[2]], transactions: [sale] }, FILING);
  assert.equal(single.joint, false);
  assert.deepEqual(single.owners, [ownerSummary(jointParsed.owners[2])]);
  assert.deepEqual(ownerSummary(null), { name: "Reporting person", cik: null, role: null, isDirector: false, isOfficer: false, isTenPercentOwner: false, entity: false });
});

test("People: every owner of a joint filing, keyed by CIK (padded or not); people first, then funds and companies", () => {
  const joint = summarizeOwnershipFiling(jointParsed, FILING);
  const own = summarizeOwnershipFiling({ owners: [{ name: "DOE JANE A", cik: "1070844", isDirector: true }], transactions: [sale] }, { ...FILING, accession: "0001193125-26-000002", filedAt: "2026-09-01" });
  const twice = summarizeOwnershipFiling({ owners: [jointParsed.owners[2], { ...jointParsed.owners[2], name: "DOE JANE" }], transactions: [sale] }, { ...FILING, accession: "0001193125-26-000003", filedAt: "2026-08-01" });
  const people = summarizePeople([joint, own, twice]);
  assert.deepEqual(people.map(p => [p.name, p.cik, p.filings, p.jointFilings]), [
    ["DOE JANE A", "0001070844", 3, 2],
    ["ZERO", null, 1, 1],
    ["BX EXAMPLE GP LLC", "0001870640", 1, 1],
    ["Example Holdings L.P.", "0001870641", 1, 1],
    ["NO CIK TRUST", null, 1, 1]
  ], "the person is listed once across padded and unpadded CIKs and a CIK repeated in one filing; funds after people");
  // An officer who filed weeks earlier stays above a sponsor's many vehicles that filed later.
  const officer = summarizeOwnershipFiling({ owners: [{ name: "ROE RICHARD", cik: "0000000777", isOfficer: true, officerTitle: "CFO" }], transactions: [sale] }, { ...FILING, accession: "0001193125-26-000004", filedAt: "2026-07-01" });
  assert.deepEqual(summarizePeople([joint, officer]).map(p => p.name).slice(0, 3), ["DOE JANE A", "ZERO", "ROE RICHARD"]);
  assert.deepEqual([people[0].netShares, people[0].value, people[0].role, people[0].entity], [-3000, 30000, "Director · 10% owner", false]);
  // Rows from an older summary (no owners list) still count their first owner.
  const legacy = { ...own, owners: undefined };
  assert.deepEqual(summarizePeople([legacy]).map(p => [p.name, p.filings]), [["DOE JANE A", 1]]);
});

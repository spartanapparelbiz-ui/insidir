/* Searching for people by name: titles and spellings, names as people write them, and Intelligence answering a
 * question about a named person from their own SEC filings (no database, no network: the lookups are stubbed). */
import test from "node:test";
import assert from "node:assert/strict";
import { searchVariants } from "../src/sec-directory.mjs";
import { readableName, filedDay } from "../src/plain-language.mjs";
import { buildDirectory, personPhrase, investigate } from "../src/intelligence-investigate.mjs";

test("titles the SEC does not file are dropped, and common spellings are tried", () => {
  assert.deepEqual(searchVariants("Sheikh Tahnoon bin Zayed"), ["TAHNOON BIN ZAYED"]);
  assert.deepEqual(searchVariants("President Donald Trump"), ["DONALD TRUMP"]);
  assert.deepEqual(searchVariants("His Royal Highness Prince Alwaleed").slice(0, 1), ["ALWALEED"]);
  assert.ok(searchVariants("Mohammed bin Salman").includes("MUHAMMAD BIN SALMAN"));
  assert.deepEqual(searchVariants("Warren Buffett"), [], "a plain name has nothing to retry");
});

test("people's names read the way people write them; organizations stay as filed", () => {
  assert.equal(readableName("TRUMP DONALD J"), "Donald J. Trump");
  assert.equal(readableName("Trump Donald J. JR"), "Donald J. Trump Jr.");
  assert.equal(readableName("SAUD H R H PRINCE ALWALEED BIN TALAL BIN ABDULAZIZ"), "HRH Prince Alwaleed bin Talal bin Abdulaziz Saud");
  assert.equal(readableName("AL SAUD H.S. PRINCE BADR BIN ABDULLAH"), "H.S. Prince Badr bin Abdullah Al Saud");
  assert.equal(readableName("Al-Nahyan Tahnoon Bin Zayed S."), "Tahnoon Bin Zayed S. Al-Nahyan");
  assert.equal(readableName("O'BRIEN DEIRDRE"), "Deirdre O'Brien");
  assert.equal(readableName("bin Jassim Al-Thani Sheikh Sultan"), "Sheikh Sultan bin Jassim Al-Thani");
  assert.equal(readableName("MCDONALD JOHN III"), "John McDonald III");
  assert.equal(readableName("PUBLIC INVESTMENT FUND"), "Public Investment Fund");
  assert.equal(readableName("Donald J. Trump Revocable Trust dated April 7, 2014"), "Donald J. Trump Revocable Trust dated April 7, 2014");
  // The SEC dates filings in New York time: 9 pm on the 19th is the 19th, not the 20th.
  assert.equal(filedDay("2026-10-20T01:05:00Z"), "2026-10-19");
  assert.equal(filedDay("2026-10-19"), "2026-10-19");
});

test("the name a question asks about", () => {
  assert.equal(personPhrase("What has Donald Trump disclosed?"), "Donald Trump");
  assert.equal(personPhrase("Is Prince Alwaleed bin Talal buying or selling?"), "Prince Alwaleed bin Talal");
  assert.equal(personPhrase("Show me Warren Buffett’s recent filings"), "Warren Buffett");
  assert.equal(personPhrase("Elon Musk sales this year"), "Elon Musk");
});

const NOW = Date.parse("2026-10-21T15:00:00Z");
const dir = buildDirectory([{ ticker: "NVDA", issuer_name: "NVIDIA CORP", issuer_cik: "1045810" }]);
const run = async sql => ({ rows: /FROM watchlist|followed_people/.test(sql) ? [{ tickers: [], people: [] }] : [] });
const TRUMP = { cik: "0000947033", name: "TRUMP DONALD J", kind: "person", isReportingOwner: true, url: "person.html?cik=0000947033", latestRole: null };

test("Intelligence answers about a named person from their own SEC filings", async () => {
  const asked = [];
  const a = await investigate("u", "What has Donald Trump disclosed?", { run, directory: dir, now: NOW,
    findPeople: async q => { asked.push(q); return { exact: true, items: [TRUMP, { cik: "0002016181", name: "Trump Donald J. JR", kind: "person" }] }; },
    loadFiler: async () => ({ edgar: { recentFilings: [{ form: "SCHEDULE 13D/A", filedAt: "2025-12-22", reportDate: null, accession: "0000947033-25-000001",
      url: "https://www.sec.gov/Archives/edgar/data/947033/000094703325000001/0000947033-25-000001-index.htm" }] } }) });
  assert.deepEqual(asked, ["Donald Trump"]);
  assert.equal(a.status, "answered");
  assert.equal(a.plan.person.name, "TRUMP DONALD J");
  assert.equal(a.plan.timeLabel, "the last 12 months", "a person's filings are read over a year unless the question names a period");
  assert.match(a.summary[0].text, /^Donald J\. Trump files with the SEC\. In the last 12 months they filed 1 report; the latest is a stake of more than 5% \(amended\) \(Schedule 13D\/A\), filed Dec 22, 2025\.$/);
  assert.match(a.summary[1].text, /no insider trades \(Form 4\) on record for Donald J\. Trump/);
  const sec = a.sections.find(s => s.kind === "person");
  assert.equal(sec.title, "Donald J. Trump's SEC filings");
  assert.match(sec.facts[0].text, /Listed by the SEC as TRUMP DONALD J/);
  assert.ok(sec.filings[0].cites.length, "each filing is cited to its SEC document");
  assert.ok(a.citations.every(c => /^https:\/\/www\.sec\.gov\//.test(c.url)));
  assert.ok(a.gaps.some(g => /Others with a similar name: Donald J\. Trump Jr\./.test(g)));
  assert.ok(!a.gaps.some(g => /did not match a company/.test(g)));
});

test("a name with no SEC filings gets a plain answer, never a guess", async () => {
  const a = await investigate("u", "Nancy Pelosi trades", { run, directory: dir, now: NOW,
    findPeople: async () => ({ exact: false, items: [{ cik: "1", name: "Yao Nancy", kind: "person" }] }), loadFiler: async () => null });
  assert.equal(a.status, "unresolved");
  assert.equal(a.plan.person, null, "a near-miss name is not presented as the person asked about");
  assert.match(a.summary[0].text, /No company or person named “Nancy Pelosi” files with the SEC/);
});

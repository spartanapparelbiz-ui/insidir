import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { form4Headline, form4Summary, filingHeadline, factHeadline, eventHeadline, periodPhrase, scaled } from "../src/plain-language.mjs";
import { parseOwnership } from "../src/sec.mjs";

const line = (code, shares, extra = {}) => ({ transaction_code: code, derivative: false, shares: String(shares), transaction_date: "2026-10-14", ...extra });

test("a Form 4 is headlined in plain words, by what it reports", () => {
  assert.equal(form4Headline([line("S", 100)]), "Insider share sale disclosed");
  assert.equal(form4Headline([line("P", 100)]), "Insider share purchase disclosed");
  assert.equal(form4Headline([line("F", 10), line("S", 100)]), "Insider share sale and tax withholding disclosed");
  assert.equal(form4Headline([]), "Insider holdings report filed");
  assert.equal(form4Headline([line("J", 5)]), "Other insider transaction disclosed");
  assert.equal(form4Headline([line("S", 1)], { amended: true }), "Insider share sale disclosed (amended filing)");
  // Code M is an option exercise only when the derivative is an option; restricted stock units convert.
  const rsu = [{ ...line("M", 50), derivative: true, security_title: "Restricted Stock Unit" }, line("M", 50), line("S", 20)];
  assert.equal(form4Headline(rsu), "Insider share sale and stock unit conversion disclosed");
  const option = [{ ...line("M", 50), derivative: true, security_title: "Stock Option (Right to Buy)" }, line("M", 50)];
  assert.equal(form4Headline(option), "Insider option exercise disclosed");
  assert.equal(form4Headline([line("S", 1), line("A", 1), line("G", 1)]), "Insider share sale, stock award and other transactions disclosed");
});

test("the sentence keeps the figures as filed and every qualification", () => {
  const lines = [line("P", 84507, { price_per_share: "128.28", estimated_value: "10840557.96", direct_ownership: "I", nature_of_ownership: "Held By Revocable Trust", footnote_ids: ["F1", "F2"] }),
    line("P", 100139, { price_per_share: "128.28", estimated_value: "12845830.92", direct_ownership: "I", nature_of_ownership: "Held By Revocable Trust", footnote_ids: ["F1"] })];
  const s = form4Summary(lines, { owners: [{ owner_name: "Robert C. Pohlad", role: "Director" }], issuer: "PepsiCo", filedOn: "2026-10-16", plan: true });
  assert.match(s, /^Robert C\. Pohlad \(Director\) bought 184,646 shares of PepsiCo at \$128\.28 a share, \$23,686,388\.88 as filed\./);
  assert.match(s, /Traded Oct 14, 2026, filed Oct 16, 2026\./);
  assert.match(s, /Held indirectly, as filed: By Revocable Trust\./);
  assert.match(s, /The filing marks transactions made under a pre-arranged trading plan \(Rule 10b5-1\)\./);
  assert.match(s, /The filing adds 2 footnotes to these lines; read them in the filing detail\./);
  // No rounding in the sentence, and no price invented for a line without one.
  const noPrice = form4Summary([line("A", 1000)], { issuer: "Acme", filedOn: "2026-01-02" });
  assert.equal(noPrice, "A reporting insider received 1,000 shares of Acme as an award. Traded Oct 14, 2026, filed Jan 2, 2026.");
  assert.match(form4Summary([line("S", 10, { price_per_share: "5", estimated_value: "50" }), line("S", 5)], {}), /\$50 as filed \(some lines have no price\)/);
  assert.match(form4Summary([{ ...line("A", 4.7), derivative: true, security_title: "Restricted Stock Units", price_per_share: "229.65" }], {}), /at \$229\.65 a unit/);
  assert.match(form4Summary([line("P", 418, { price_per_share: "23.725", estimated_value: "9917.05" })], {}), /at \$23\.725 a share, \$9,917\.05 as filed/, "a filed price is never rounded");
  assert.match(form4Summary([line("P", 1, { price_per_share: "345", estimated_value: "345" })], {}), /at \$345\.00 a share/);
  assert.match(form4Summary([line("F", 3)], { amended: true, originalFiledOn: "2026-09-02" }), /This amends an earlier filing made Sep 2, 2026\./);
  assert.match(form4Summary([line("S", 3, { direct_ownership: "I", nature_of_ownership: "See footnote" })], {}), /held indirectly, for example through a trust/);
});

test("company filings, facts and events read as headlines", () => {
  assert.equal(filingHeadline("8-K", [{ code: "9.01" }, { code: "2.02" }]), "Financial results reported");
  assert.equal(filingHeadline("8-K", [{ code: "5.02" }, { code: "2.02" }]), "Executive or director change reported", "a leadership change is not hidden behind routine results");
  assert.equal(filingHeadline("8-K", [{ code: "4.02" }, { code: "2.02" }]), "Earlier financial statements no longer to be relied on");
  assert.equal(filingHeadline("8-K", [{ code: "7.01" }]), "Company announcement filed");
  assert.equal(filingHeadline("10-K/A"), "Annual report filed (amended)");
  assert.equal(filingHeadline("SCHEDULE 13G"), "Passive stake of more than 5% reported");
  assert.equal(filingHeadline("424B2"), "Prospectus filed", "a prospectus is not read as a Form 4");
  assert.equal(filingHeadline("4/A"), "Insider transaction disclosed");
  assert.equal(filingHeadline("N-PX"), "SEC filing: Form N-PX");
  assert.equal(factHeadline({ label: "Revenue", change: 5, changePct: 0.1636, prior: { value: 94 }, current: { value: 109 } }), "Revenue 16.4% higher than a year earlier");
  // A loss that shrinks is not a percentage rise.
  assert.equal(factHeadline({ label: "Net income", change: 5, changePct: 0.5, prior: { value: -10 }, current: { value: -5 } }), "Net income higher than a year earlier");
  assert.equal(factHeadline({ label: "Revenue", change: 0 }), "Revenue unchanged from a year earlier");
  assert.equal(periodPhrase("instant", "2026-06-27"), "at Jun 27, 2026");
  assert.equal(periodPhrase("quarter", "2026-06-27"), "for the quarter ended Jun 27, 2026");
  assert.equal(scaled(109417000000), "$109.4 billion");
  assert.equal(scaled(999999), null);
  assert.equal(eventHeadline({ event_type: "insider_sale", facts: {} }), "Insider share sale disclosed");
  assert.equal(eventHeadline({ event_type: "multi_insider_purchase" }), "Share purchases by several insiders disclosed");
  assert.equal(eventHeadline({ event_type: "company_disclosure", facts: { form: "8-K", items: [{ code: "5.02" }] } }), "Executive or director change reported");
});

test("Form 4 footnotes are read with the lines that cite them", () => {
  const xml = readFileSync(new URL("./fixtures/form4/000005513526000165.xml", import.meta.url), "utf8");
  const f = parseOwnership(xml, { accession: "000005513526000165", filerCik: "55135", sourceUrl: "https://www.sec.gov/Archives/edgar/data/55135/000005513526000165/" });
  assert.ok(f.footnotes.length >= 1);
  for (const n of f.footnotes) { assert.match(n.id, /^F\d+$/); assert.ok(n.text.length > 10); assert.doesNotMatch(n.text, /\s{2}/); }
  const cited = new Set(f.transactions.flatMap(t => t.footnoteIds));
  assert.ok(cited.size >= 1, "at least one line cites a footnote");
  for (const id of cited) assert.ok(f.footnotes.some(n => n.id === id), "every cited footnote has its text: " + id);
});

test("form4Simple: a purchase in everyday words, every figure as filed, and what the form cannot say", async () => {
  const { form4Simple } = await import("../src/plain-language.mjs");
  const lines = [84507, 45075, 45075, 9989].map(s => ({ transaction_code: "P", shares: String(s), price_per_share: "128.28", estimated_value: (s * 128.28).toFixed(2),
    derivative: false, direct_ownership: "I", nature_of_ownership: "By Revocable Trust", transaction_date: "2026-10-14" }));
  const r = form4Simple(lines, { owners: [{ owner_name: "Robert C. Pohlad", role: "Director" }], issuer: "PepsiCo", filedOn: "2026-10-16" });
  assert.equal(r.headline, "Robert C. Pohlad bought about $23.7 million of PepsiCo shares");
  const say = Object.fromEntries(r.points.map(p => [p.label, p.text]));
  assert.equal(say.Who, "Robert C. Pohlad, Director at PepsiCo.");
  assert.equal(say.What, "Bought 184,646 shares at $128.28 each: about $23.7 million in total ($23,686,388.88 as filed).");
  assert.match(say.When, /^Traded Oct 14, 2026\. Told the SEC Oct 16, 2026, 2 days later\./);
  assert.match(say["Good to know"], /as filed: “By Revocable Trust”/);
  assert.match(r.points.at(-1).text, /not the reason, and it is not a recommendation/);
  assert.deepEqual(r.terms.map(t => t.term), ["Form 4", "Code P", "Held indirectly"]);
});

test("form4Simple: tax withholding, awards and exercises are explained as what they are, never as market sales", async () => {
  const { form4Simple } = await import("../src/plain-language.mjs");
  const r = form4Simple([
    { transaction_code: "M", derivative: true, security_title: "Restricted Stock Unit", shares: "196410", transaction_date: "2026-09-10" },
    { transaction_code: "M", derivative: false, shares: "196410", transaction_date: "2026-09-10" },
    { transaction_code: "F", derivative: false, shares: "100348", price_per_share: "223.19", estimated_value: "22396670.12", transaction_date: "2026-09-10" }
  ], { owners: [{ owner_name: "Tim Cook", role: "CEO" }], issuer: "Apple Inc.", filedOn: "2026-09-14", plan: true });
  const text = r.points.map(p => p.text).join(" ");
  assert.match(text, /Turned 196,410 stock units into company shares/);
  assert.match(text, /Had 100,348 shares held back to pay taxes/);
  assert.match(text, /not a decision to sell on the market/);
  assert.match(text, /pre-set trading plan \(Rule 10b5-1\)/);
  assert.equal(r.points[0].text, "Tim Cook, CEO at Apple Inc.");
  assert.doesNotMatch(text, /\b(should|buy now|bullish|bearish|signal)\b/i, "no advice or judgement");
});

test("readableName: SEC surname-first capitals read as people write names; companies keep their order", async () => {
  const { readableName } = await import("../src/plain-language.mjs");
  assert.equal(readableName("POHLAD ROBERT C"), "Robert C. Pohlad");
  assert.equal(readableName("COOK TIMOTHY D"), "Timothy D. Cook");
  assert.equal(readableName("SMITH JOHN A JR"), "John A. Smith Jr.");
  assert.equal(readableName("BERKSHIRE HATHAWAY INC"), "Berkshire Hathaway Inc");
  assert.equal(readableName("Elon Musk"), "Elon Musk");
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { directiveFindings, guaranteeFindings } from "../src/compliance-guard.mjs";
// The engine's config is read once at import: point it at the test database before anything imports it.
if (process.env.INSIDIR_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.INSIDIR_TEST_DATABASE_URL;
const { purchaseChains, compareVersions, decimalSum, eventSummary } = await import("../src/research-events.mjs");

/* The research engine. Fixtures are SYNTHETIC filings (fictional issuers and people, CIKs in an unused range), never
 * presented as real transactions. The PostgreSQL part runs only with INSIDIR_TEST_DATABASE_URL. */

test("decimal sums are exact and skip missing figures", () => {
  assert.equal(decimalSum(["0.1", "0.2"]), "0.3");
  assert.equal(decimalSum(["1000.5", "250", null]), "1250.5");
  assert.equal(decimalSum(["12345678901234.12", "0.00000001"]), "12345678901234.12000001");
  assert.equal(decimalSum([null, undefined]), null);
});

test("purchase chains: trades within 14 days chain, a chain spans at most 30 days, joint filings count once", () => {
  const e = (key, date, owner, owners) => ({ event_key: key, transaction_date: date, owner_cik: owner, facts: { owners: owners || [{ cik: owner }] } });
  const chains = purchaseChains([e("a", "2026-01-01", "1"), e("b", "2026-01-10", "2"), e("c", "2026-01-20", "1"), e("d", "2026-02-05", "3"),
    e("j", "2026-03-01", null, [{ cik: "7" }, { cik: "8" }]), e("k", "2026-03-02", null, [{ cik: "8" }, { cik: "7" }])]);
  assert.deepEqual(chains.map(c => [c.start, c.events.length, c.reporters.length]), [["2026-01-01", 3, 2], ["2026-02-05", 1, 1], ["2026-03-01", 2, 1]]);
});

test("version comparison: unchanged, changed (before and after), added, removed", () => {
  const l = (id, date, shares, price = "10") => ({ id, transaction_date: date, transaction_code: "P", acquired_disposed: "A", derivative: false, security_title: "Common Stock", shares, price_per_share: price });
  const d = compareVersions([l("o1", "2026-01-02", "100"), l("o2", "2026-01-03", "50"), l("o3", "2026-01-04", "5")], [l("n1", "2026-01-02", "100"), l("n2", "2026-01-03", "60"), l("n4", "2026-01-05", "9")]);
  assert.deepEqual([d.unchanged.map(x => x.id), d.changed.map(c => [c.before.id, c.after.id]), d.added.map(x => x.id), d.removed.map(x => x.id)], [["n1"], [["o2", "n2"]], ["n4"], ["o3"]]);
});

test("summaries state what was filed: figures and dates, no directive or promise", () => {
  const s = eventSummary({ event_type: "insider_purchase", ticker: "TSTA", transaction_date: "2026-10-01", transaction_date_end: "2026-10-02", filing_date: "2026-10-03T21:05:00Z",
    facts: { owners: [{ name: "Example Person", roles: ["Chief Executive Officer"] }], totalShares: "1250.5", totalValue: "12505", priceLow: "10", priceHigh: "10", valueComplete: true } });
  assert.equal(s, "Example Person (Chief Executive Officer) reported buying 1,250.5 shares of TSTA at $10 a share on Oct 1, 2026 to Oct 2, 2026; reported value $12,505. Form 4 filed Oct 3, 2026.");
  assert.deepEqual(directiveFindings(s), []); assert.deepEqual(guaranteeFindings(s), []);
});

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
test("research events on PostgreSQL", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const { migrate, pool, persistFiling, persistFailure } = await import("../src/db.mjs");
  const RE = await import("../src/research-events.mjs");
  await migrate();
  t.after(() => pool.end());
  const q = (sql, p) => pool.query(sql, p);
  const tag = Math.floor(Math.random() * 1e6);
  const issuer = String(990000000 + tag).slice(0, 10).padStart(10, "0"), ticker = "T" + String(tag).padStart(6, "0").slice(0, 5);
  const acc = n => String(9900000000 + tag).slice(-10) + "26" + String(n).padStart(6, "0");
  const person = n => String(980000000 + tag * 10 + n).padStart(10, "0");
  const day = n => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); };
  let seq = 0;
  const line = (a, i, o, { code = "P", ad = code === "P" ? "A" : "D", shares = "100", price = "10", date = day(10), derivative = false } = {}) => ({
    id: `${a}:${derivative ? "D" : "N"}:${i}`, accession: a, issuerCik: issuer, ticker, ownerCik: o?.cik ?? null, ownerName: o?.name ?? "Joint Owners", transactionDate: date,
    securityTitle: "Common Stock", code, acquiredDisposed: ad, category: !derivative && code === "P" && ad === "A" ? "reported_purchase" : !derivative && code === "S" && ad === "D" ? "reported_sale" : "other",
    derivative, shares: Number(shares), pricePerShare: Number(price), estimatedValue: Math.round(Number(shares) * Number(price) * 100) / 100, directOwnership: "D", sourceUrl: `https://www.sec.gov/Archives/edgar/data/${issuer.replace(/^0+/, "")}/${a}/`
  });
  const file = async (n, owners, lines, { amendment = false, period = day(10), publishedDaysAgo = 8 } = {}) => {
    const a = acc(n);
    await persistFiling({ accession: a, filerCik: owners[0].cik, issuerCik: issuer, issuerName: "Synthetic Test Issuer Inc", ticker, title: "4 - synthetic",
      formType: amendment ? "4/A" : "4", publishedAt: new Date(Date.now() - publishedDaysAgo * 86400000 + (seq++) * 1000).toISOString(), periodOfReport: period, isAmendment: amendment,
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/${issuer.replace(/^0+/, "")}/${a}/`, xmlUrl: `https://www.sec.gov/Archives/edgar/data/${issuer.replace(/^0+/, "")}/${a}/form4.xml`,
      owners: owners.map(o => ({ ...o, isOfficer: !!o.title, officerTitle: o.title || null, isDirector: !o.title })), transactions: lines(a) });
    return a;
  };
  const A = { cik: person(1), name: "Person Alpha", title: "Chief Financial Officer" }, B = { cik: person(2), name: "Person Beta" }, C = { cik: person(3), name: "Person Gamma" },
    D = { cik: person(4), name: "Person Delta" }, J1 = { cik: person(5), name: "Fund Epsilon LP" }, J2 = { cik: person(6), name: "Epsilon GP LLC" };
  const ev = async key => (await q("SELECT * FROM research_events WHERE event_key=$1", [key])).rows[0];
  const build = () => RE.buildResearchEvents({ query: q });
  await build(); // catch up on whatever other suites imported

  const a1 = await file(1, [A], a => [line(a, 0, A, { shares: "1000.5", price: "10.25", date: day(12) }), line(a, 1, A, { shares: "250", price: "10.5", date: day(11) }), line(a, 2, A, { code: "A", ad: "A", shares: "5000", price: "0" })], { period: day(11) });
  const b1 = await file(2, [B], a => [line(a, 0, B, { code: "S", shares: "300", price: "11", date: day(9) })], { period: day(9) });

  await t.test("one purchase event and one sale event per filing, figures exact, dates kept apart", async () => {
    const r = await build();
    assert.ok(r.created >= 2);
    const p = await ev(`form4:${a1}:P`);
    assert.equal(p.event_type, "insider_purchase");
    assert.equal(p.facts.lineCount, 2, "the award line is not a purchase");
    assert.equal(p.facts.totalShares, "1250.5");
    assert.equal(p.facts.totalValue, decimalSum([String(Math.round(1000.5 * 10.25 * 100) / 100), "2625"]));
    assert.deepEqual([p.facts.priceLow, p.facts.priceHigh], ["10.25", "10.5"]);
    assert.equal(new Date(p.transaction_date).getDate(), new Date(day(12) + "T12:00:00").getDate());
    assert.ok(p.filing_date && p.ingested_at && p.detected_at, "transaction date, filing time, retrieval time and detection time are separate columns");
    assert.ok(p.reporting_lag_days >= 3 && p.reporting_lag_days <= 4, String(p.reporting_lag_days));
    assert.deepEqual(p.accessions, [a1]);
    assert.ok(p.source_urls.some(u => u.endsWith("form4.xml")));
    assert.deepEqual(p.facts.owners[0].roles, ["Chief Financial Officer"]);
    assert.equal((await ev(`form4:${b1}:S`)).event_type, "insider_sale");
  });

  await t.test("rebuilding creates nothing new", async () => {
    await q("UPDATE research_cursors SET position='epoch',last_key='' WHERE name='form4'");
    const before = (await q("SELECT count(*)::int AS n FROM research_events WHERE ticker=$1", [ticker])).rows[0].n;
    const r = await build();
    assert.ok(r.filings >= 2);
    assert.equal((await q("SELECT count(*)::int AS n FROM research_events WHERE ticker=$1", [ticker])).rows[0].n, before);
  });

  await t.test("distinct owners buying within the window form one group, re-issued as it grows; a joint filing counts once", async () => {
    await file(3, [C], a => [line(a, 0, C, { shares: "40", price: "10", date: day(6) })], { period: day(6), publishedDaysAgo: 4 });
    await build();
    const two = (await q("SELECT * FROM research_events WHERE event_type='multi_insider_purchase' AND ticker=$1 AND status='active'", [ticker])).rows;
    assert.equal(two.length, 1);
    assert.equal(two[0].facts.distinctReportingOwners, 2);
    assert.match(two[0].facts.caveats.join(" "), /does not mean the owners acted together/);
    await file(4, [J1, J2], a => [line(a, 0, null, { shares: "10", price: "10", date: day(5) })], { period: day(5), publishedDaysAgo: 3 });
    await build();
    const three = (await q("SELECT * FROM research_events WHERE event_type='multi_insider_purchase' AND ticker=$1 AND status='active'", [ticker])).rows;
    assert.equal(three.length, 1);
    assert.equal(three[0].facts.distinctReportingOwners, 3, "the joint filing's two owners count as one");
    assert.equal((await ev(two[0].event_key)).status, "superseded");
    const people = (await q("SELECT owner_cik FROM research_event_people WHERE event_id=$1 ORDER BY 1", [three[0].id])).rows.map(r => r.owner_cik);
    for (const o of [A, C, J1, J2]) assert.ok(people.includes(o.cik), o.name);
    assert.equal(three[0].facts.totalValue, decimalSum(three[0].facts.purchases.map(p => p.totalValue)));
  });

  await t.test("a Form 4/A: compared line by line; the corrected event is superseded; restated lines do not double count", async () => {
    const amended = await file(5, [A], a => [line(a, 0, A, { shares: "1000.5", price: "10.25", date: day(12) }), line(a, 1, A, { shares: "350", price: "10.5", date: day(11) })], { amendment: true, period: day(11), publishedDaysAgo: 2 });
    await build();
    const am = await ev(`amendment:${amended}`);
    assert.equal(am.facts.amends, a1);
    assert.equal(am.facts.unchanged, 1);
    assert.equal(am.facts.changed.length, 1);
    assert.deepEqual([am.facts.changed[0].before.shares, am.facts.changed[0].after.shares], ["250", "350"]);
    assert.equal(am.facts.removed.length, 1, "the award line of the original is not in the amendment");
    assert.equal((await ev(`form4:${a1}:P`)).status, "superseded");
    assert.equal((await ev(`form4:${a1}:P`)).superseded_by, amended);
    const fresh = await ev(`form4:${amended}:P`);
    assert.equal(fresh.facts.lineCount, 1, "only the changed line is a new (amended) purchase event");
    assert.equal(fresh.facts.amended, true);
    // A pure restatement adds nothing and supersedes nothing.
    const restated = await file(6, [B], a => [line(a, 0, B, { code: "S", shares: "300", price: "11", date: day(9) })], { amendment: true, period: day(9), publishedDaysAgo: 1 });
    await build();
    assert.equal(await ev(`form4:${restated}:S`), undefined);
    assert.equal((await ev(`form4:${b1}:S`)).status, "active");
    assert.equal((await ev(`amendment:${restated}`)).facts.unchanged, 1);
    // An amendment whose original was never imported says so.
    const orphan = await file(7, [D], a => [line(a, 0, D, { shares: "5", price: "10", date: day(40) })], { amendment: true, period: day(40), publishedDaysAgo: 1 });
    await build();
    assert.equal((await ev(`amendment:${orphan}`)).facts.originalInImport, false);
    assert.match(RE.eventSummary(await ev(`amendment:${orphan}`)), /not in Insidir's import/);
  });

  await t.test("reading: by ticker and by person (joint owners included), summaries carry no advice", async () => {
    const byTicker = await RE.listResearchEvents(q, { ticker });
    assert.ok(byTicker.length >= 5);
    assert.ok(byTicker.every(e => e.status === "active"));
    const byJoint = await RE.listResearchEvents(q, { ownerCik: J2.cik.replace(/^0+/, "") });
    assert.ok(byJoint.some(e => e.event_type === "insider_purchase" && e.facts.joint));
    for (const e of byTicker) { assert.deepEqual(directiveFindings(e.summary), [], e.summary); assert.deepEqual(guaranteeFindings(e.summary), [], e.summary); }
  });

  await t.test("company disclosures of watched companies: baseline first, new filings after, failures recorded", async () => {
    const uid = (await q("INSERT INTO users(email,password_hash) VALUES($1,'x') RETURNING id", [`watch-${randomUUID()}@example.com`])).rows[0].id;
    await q("INSERT INTO watchlist(user_id,ticker) VALUES($1,$2)", [uid, ticker]);
    const { tickerIndex } = await import("../src/intelligence.mjs");
    const filed = day(3);
    let submissions = { name: "Synthetic Test Issuer Inc", filings: { recent: { form: ["8-K", "4", "10-Q"], accessionNumber: [`${issuer}-26-000101`, `${issuer}-26-000102`, `${issuer}-26-000103`],
      filingDate: [filed, filed, day(200)], acceptanceDateTime: [filed + "T16:05:00.000Z", filed + "T16:06:00.000Z", day(200) + "T10:00:00.000Z"], items: ["5.02,9.01", "", ""], primaryDocument: ["a.htm", "b.xml", "c.htm"], reportDate: ["", "", ""] } } };
    let fail = false;
    const fetcher = async url => {
      if (url.endsWith("company_tickers.json")) return { 0: { cik_str: Number(issuer), ticker, title: "Synthetic Test Issuer Inc" } };
      if (fail) throw new Error("SEC responded 503");
      return submissions;
    };
    await tickerIndex(fetcher).catch(() => {});
    const r1 = await RE.pollCompanyDisclosures({ query: q, fetcher });
    assert.ok(r1.checked >= 1);
    const first = await ev(`disclosure:${issuer}26000101`);
    assert.equal(first.facts.form, "8-K");
    assert.deepEqual(first.facts.items.map(i => i.code), ["5.02", "9.01"]);
    assert.equal(first.facts.baseline, true, "found on the first read: recorded, never alerted");
    assert.equal(await ev(`disclosure:${issuer}26000102`), undefined, "Form 4s come from the Form 4 import, not here");
    assert.equal(await ev(`disclosure:${issuer}26000103`), undefined, "older than the lookback");
    assert.equal((await RE.pollCompanyDisclosures({ query: q, fetcher })).checked, 0, "not read again within 6 hours");
    await q("UPDATE disclosure_sources SET last_checked_at=now()-interval '7 hours' WHERE issuer_cik=$1", [issuer]);
    submissions.filings.recent.form.unshift("SC 13D"); submissions.filings.recent.accessionNumber.unshift(`${issuer}-26-000104`); submissions.filings.recent.filingDate.unshift(day(0));
    submissions.filings.recent.acceptanceDateTime.unshift(day(0) + "T12:00:00.000Z"); submissions.filings.recent.items.unshift(""); submissions.filings.recent.primaryDocument.unshift("d.htm"); submissions.filings.recent.reportDate.unshift("");
    await RE.pollCompanyDisclosures({ query: q, fetcher });
    assert.equal((await ev(`disclosure:${issuer}26000104`)).facts.baseline, false);
    await q("UPDATE disclosure_sources SET last_checked_at=now()-interval '7 hours' WHERE issuer_cik=$1", [issuer]);
    fail = true;
    assert.equal((await RE.pollCompanyDisclosures({ query: q, fetcher })).failed, 1);
    assert.equal((await q("SELECT failures,last_error FROM disclosure_sources WHERE issuer_cik=$1", [issuer])).rows[0].failures, 1);
    await q("DELETE FROM users WHERE id=$1", [uid]);
  });

  await t.test("failed imports are retried with backoff and recover", async () => {
    const a = acc(9);
    const filing = { accession: a, filerCik: A.cik, title: "4 - synthetic", formType: "4", sourceUrl: `https://www.sec.gov/Archives/edgar/data/1/${a}/`, publishedAt: new Date().toISOString() };
    await persistFailure(filing, new Error("SEC responded 500"));
    await q("UPDATE sec_filings SET updated_at=now()-interval '20 minutes' WHERE accession=$1", [a]);
    const failing = await RE.retryFailedFilings({ query: q, load: async () => { throw new Error("SEC responded 500"); }, persist: persistFiling });
    assert.ok(failing.failed >= 1);
    const row = (await q("SELECT attempts,next_retry_at>now() AS later FROM sec_filings WHERE accession=$1", [a])).rows[0];
    assert.deepEqual([row.attempts, row.later], [1, true]);
    await q("UPDATE sec_filings SET next_retry_at=now()-interval '1 second' WHERE accession=$1", [a]);
    const ok = await RE.retryFailedFilings({ query: q, persist: persistFiling, load: async f => ({ ...f, issuerCik: issuer, issuerName: "Synthetic Test Issuer Inc", ticker, periodOfReport: null, isAmendment: false, xmlUrl: null, owners: [A], transactions: [] }) });
    assert.ok(ok.recovered >= 1);
    assert.equal((await q("SELECT ingest_status FROM sec_filings WHERE accession=$1", [a])).rows[0].ingest_status, "parsed");
  });
});

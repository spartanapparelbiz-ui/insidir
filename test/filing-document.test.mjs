import test from "node:test";
import assert from "node:assert/strict";
import { readOwnershipDocument, indexUrl } from "../src/filing-document.mjs";

/* The SEC filing inside Insidir. The filing below is SYNTHETIC (a fictional issuer and people), shaped like EDGAR's
 * ownership XML. The PostgreSQL part runs only with INSIDIR_TEST_DATABASE_URL. */
const XML = `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0508</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2026-10-21</periodOfReport>
  <notSubjectToSection16>0</notSubjectToSection16>
  <aff10b5One>1</aff10b5One>
  <issuer><issuerCik>0000000099</issuerCik><issuerName>EXAMPLE CORP</issuerName><issuerTradingSymbol>EXMP</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0000000042</rptOwnerCik><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
    <reportingOwnerAddress><rptOwnerStreet1>1 EXAMPLE WAY</rptOwnerStreet1><rptOwnerStreet2></rptOwnerStreet2><rptOwnerCity>SPRINGFIELD</rptOwnerCity><rptOwnerState>IL</rptOwnerState><rptOwnerZipCode>62701</rptOwnerZipCode></reportingOwnerAddress>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-21</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>S</transactionCode><equitySwapInvolved>0</equitySwapInvolved><footnoteId id="F1"/></transactionCoding>
      <transactionAmounts><transactionShares><value>12000</value></transactionShares><transactionPricePerShare><value>78.6025</value><footnoteId id="F2"/></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>40000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeHolding>
      <securityTitle><value>Common Stock</value></securityTitle>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>I</value></directOrIndirectOwnership><natureOfOwnership><value>By Family Trust</value><footnoteId id="F3"/></natureOfOwnership></ownershipNature>
    </nonDerivativeHolding>
  </nonDerivativeTable>
  <derivativeTable>
    <derivativeTransaction>
      <securityTitle><value>Stock Option (right to buy)</value></securityTitle>
      <conversionOrExercisePrice><value>20.50</value></conversionOrExercisePrice>
      <transactionDate><value>2026-10-20</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>M</transactionCode><equitySwapInvolved>0</equitySwapInvolved></transactionCoding>
      <transactionTimeliness><value>E</value></transactionTimeliness>
      <transactionAmounts><transactionShares><value>1500</value></transactionShares><transactionPricePerShare><value>0</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <exerciseDate><footnoteId id="F4"/></exerciseDate>
      <expirationDate><value>2030-03-01</value></expirationDate>
      <underlyingSecurity><underlyingSecurityTitle><value>Common Stock</value></underlyingSecurityTitle><underlyingSecurityShares><value>1500</value></underlyingSecurityShares></underlyingSecurity>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>3000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </derivativeTransaction>
  </derivativeTable>
  <footnotes>
    <footnote id="F1">The sale was made under a Rule 10b5-1 trading plan adopted on May 1, 2026.</footnote>
    <footnote id="F2">Weighted average price. The shares were sold in multiple trades at prices from $78.10 to $79.05.</footnote>
    <footnote id="F3">Held by a trust for the benefit of the reporting person's family.</footnote>
    <footnote id="F4">The option vested in three equal annual installments.</footnote>
  </footnotes>
  <remarks>Power of attorney on file.</remarks>
  <ownerSignature><signatureName>/s/ Jane Doe</signatureName><signatureDate>2026-10-23</signatureDate></ownerSignature>
</ownershipDocument>`;

test("the whole form, as filed: boxes, both tables with holdings, every footnote mark, remarks and the signature", () => {
  const d = readOwnershipDocument(XML);
  assert.deepEqual([d.form, d.periodOfReport, d.rule10b51, d.notSubjectToSection16], ["4", "2026-10-21", true, false]);
  assert.deepEqual(d.issuer, { cik: "0000000099", name: "EXAMPLE CORP", ticker: "EXMP" });
  assert.deepEqual(d.owners[0].address, ["1 EXAMPLE WAY", "SPRINGFIELD IL 62701"], "an empty second street line is left out");
  assert.deepEqual([d.owners[0].director, d.owners[0].officer, d.owners[0].tenPercentOwner, d.owners[0].officerTitle], [true, true, false, "Chief Executive Officer"]);
  const [sale, held] = d.nonDerivative;
  assert.equal(sale.holding, false); assert.equal(held.holding, true);
  assert.deepEqual(sale.code, { v: "S", fn: ["F1"] }, "a mark on the coding block stays with the code");
  assert.deepEqual(sale.price, { v: "78.6025", fn: ["F2"] }, "the price exactly as filed, never rounded");
  assert.deepEqual([sale.shares.v, sale.acquiredDisposed.v, sale.ownedAfter.v, sale.ownership.v], ["12000", "D", "40000", "D"]);
  assert.deepEqual([held.date, held.code, held.shares, held.nature], [null, null, null, { v: "By Family Trust", fn: ["F3"] }]);
  const [option] = d.derivative;
  assert.deepEqual([option.exercisePrice.v, option.voluntary, option.exerciseDate, option.expirationDate.v, option.underlyingShares.v], ["20.50", true, { v: null, fn: ["F4"] }, "2030-03-01", "1500"],
    "a box that holds only a footnote mark keeps the mark");
  assert.equal(d.footnotes.length, 4);
  assert.match(d.footnotes[1].text, /^Weighted average price\./);
  assert.equal(d.remarks, "Power of attorney on file.");
  assert.deepEqual(d.signatures, [{ name: "/s/ Jane Doe", date: "2026-10-23" }]);
  assert.throws(() => readOwnershipDocument("<html>not a filing</html>"), /Not an SEC ownership document/);
  assert.equal(indexUrl({ xml_url: "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml" }), "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/");
  assert.equal(indexUrl({ xml_url: "https://evil.example/Archives/edgar/data/42/000000004226000015/x.xml" }), null);
});

test("the filing page shows the document in the app and always links the original on SEC.gov", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../web/filing.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../web/assets/js/filing-app.js", import.meta.url), "utf8");
  assert.match(html, /<body class="ui"/); assert.match(html, /data-fl-original/); assert.match(html, /Research, not investment advice/);
  assert.match(js, /\/document"/, "the whole filing comes from the document endpoint");
  assert.match(js, /x\.hostname==="www\.sec\.gov"/, "only SEC.gov addresses are linked as the original");
  assert.match(js, /Read it on SEC\.gov/, "when the document cannot be shown, the original is offered instead");
  const ui = await readFile(new URL("../web/assets/js/ui.js", import.meta.url), "utf8");
  assert.match(ui, /const filingHref=/);
  for (const f of ["today.js", "ticker.js"]) assert.match(await readFile(new URL("../web/assets/js/" + f, import.meta.url), "utf8"), /filingHref\(/, f + " opens filings inside Insidir");
});

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
test("on PostgreSQL: fetched from SEC.gov once, then read from the database; only SEC addresses are fetched", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const pg = (await import("pg")).default;
  const { migrate } = await import("../src/db.mjs");
  const { filingDocument } = await import("../src/filing-document.mjs");
  const pool = new pg.Pool({ connectionString: DB });
  const q = (sql, p) => pool.query(sql, p);
  const made = [];
  t.after(async () => { await q("DELETE FROM sec_filings WHERE accession=ANY($1)", [made]); await pool.end(); });
  await migrate(pool);
  const acc = String(Date.now()).padStart(18, "0").slice(-18);
  const url = `https://www.sec.gov/Archives/edgar/data/42/${acc}/form4.xml`;
  await q(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,source_url,xml_url,ingest_status,published_at)
    VALUES($1,'42','99','EXAMPLE CORP','EXMP','4','4',$2,$2,'parsed',now())`, [acc, url]);
  made.push(acc);
  const asked = [];
  const fetcher = async u => { asked.push(u); return XML; };
  const first = await filingDocument(q, acc, { fetcher });
  assert.deepEqual(asked, [url]);
  assert.equal(first.document.issuer.ticker, "EXMP");
  assert.equal(first.sourceUrl, url);
  assert.equal(first.indexUrl, `https://www.sec.gov/Archives/edgar/data/42/${acc}/`);
  const again = await filingDocument(q, acc, { fetcher });
  assert.equal(asked.length, 1, "the second view never asks the SEC");
  assert.deepEqual(again.document, first.document);
  assert.equal(await filingDocument(q, "999999999999999999", { fetcher }), null, "an unknown filing");
  // A filing whose stored address is not on SEC.gov is never fetched.
  const acc2 = String(Number(acc) + 1).padStart(18, "0");
  await q(`INSERT INTO sec_filings(accession,filer_cik,title,form_type,source_url,ingest_status) VALUES($1,'42','4','4','https://evil.example/x.xml','parsed')`, [acc2]);
  made.push(acc2);
  const none = await filingDocument(q, acc2, { fetcher });
  assert.equal(none.document, null); assert.equal(asked.length, 1);
  // Not an ownership document: refused, nothing stored.
  await q("DELETE FROM sec_documents WHERE accession=$1", [acc]);
  await assert.rejects(filingDocument(q, acc, { fetcher: async () => "<html>blocked</html>" }), /did not return this filing's document/);
  assert.equal((await q("SELECT count(*)::int AS n FROM sec_documents WHERE accession=$1", [acc])).rows[0].n, 0);
});

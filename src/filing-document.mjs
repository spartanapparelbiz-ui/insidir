/* The SEC filing itself, inside Insidir: the whole ownership document (Forms 3, 4 and 5 and their amendments) as the
 * filer submitted it, laid out in the form's own boxes and tables (filing.html). Nothing is computed, rounded or
 * reworded here: every value is the text in the XML, with the footnote marks the filer attached to it.
 *
 * EDGAR filings are public records the SEC publishes for anyone to read and reuse. Each document is fetched from
 * www.sec.gov once (through secFetch: the declared User-Agent, the allowlist and the SEC's request-rate limit) and
 * kept in sec_documents (sql/029), so reading a filing again never asks the SEC a second time. The original on
 * SEC.gov stays one click away on every view (sourceUrl, indexUrl).
 *
 *   GET /v1/filings/<accession>/document   { filing, document, sourceUrl, indexUrl, retrievedAt } */
import { XMLParser } from "fast-xml-parser";
import { secFetch, allowedSecUrl } from "./sec.mjs";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false, trimValues: true, processEntities: true });
const list = v => v == null ? [] : Array.isArray(v) ? v : [v];
const text = v => v == null ? null : typeof v === "object" ? text(v["#text"] ?? v.value) : String(v).replace(/\s+/g, " ").trim() || null;
const FOOTNOTE = /^[A-Za-z0-9_-]{1,12}$/;
// The footnote marks on one element: its own <footnoteId id="F1"/> children (not those of nested elements).
const marks = node => node && typeof node === "object" ? list(node.footnoteId).map(f => f?.["@_id"]).filter(id => typeof id === "string" && FOOTNOTE.test(id)) : [];
// A value as filed, with its footnote marks: { v: "12,000"-as-written text or null, fn: ["F1"] }.
const cell = node => {
  if (node == null) return null;
  const v = typeof node === "object" ? text(node.value ?? node["#text"]) : text(node), fn = marks(node);
  return v == null && !fn.length ? null : { v, fn };
};
// Marks on a wrapper element plus those on the values inside it (transactionCoding, ownershipNature…).
const withMarks = (c, ...wrappers) => {
  const extra = wrappers.flatMap(marks);
  if (!extra.length) return c;
  return { v: c?.v ?? null, fn: [...new Set([...(c?.fn || []), ...extra])] };
};
const yes = v => /^(1|true)$/i.test(text(v) || "");

function line(t, derivative, holding) {
  const coding = t?.transactionCoding, amounts = t?.transactionAmounts, post = t?.postTransactionAmounts, nature = t?.ownershipNature, under = t?.underlyingSecurity;
  return {
    holding,
    security: cell(t?.securityTitle),
    ...(derivative ? { exercisePrice: cell(t?.conversionOrExercisePrice) } : {}),
    date: holding ? null : cell(t?.transactionDate),
    deemedDate: holding ? null : cell(t?.deemedExecutionDate),
    code: holding ? null : withMarks(cell(coding?.transactionCode), coding),
    // "V": reported voluntarily (earlier than required), as the filer marked it.
    voluntary: !holding && /^E$/i.test(text(t?.transactionTimeliness) || ""),
    swap: !holding && yes(coding?.equitySwapInvolved),
    shares: holding ? null : cell(amounts?.transactionShares) || cell(amounts?.transactionTotalValue),
    acquiredDisposed: holding ? null : cell(amounts?.transactionAcquiredDisposedCode),
    price: holding ? null : cell(amounts?.transactionPricePerShare),
    ...(derivative ? {
      exerciseDate: cell(t?.exerciseDate), expirationDate: cell(t?.expirationDate),
      underlyingTitle: cell(under?.underlyingSecurityTitle), underlyingShares: cell(under?.underlyingSecurityShares) || cell(under?.underlyingSecurityValue)
    } : {}),
    ownedAfter: withMarks(cell(post?.sharesOwnedFollowingTransaction) || cell(post?.valueOwnedFollowingTransaction), post),
    ownership: cell(nature?.directOrIndirectOwnership),
    nature: cell(nature?.natureOfOwnership)
  };
}

/* The whole ownership document, in the form's order. Throws when the XML is not an ownershipDocument. */
export function readOwnershipDocument(xml) {
  const root = parser.parse(String(xml || ""))?.ownershipDocument;
  if (!root || !root.issuer) throw new Error("Not an SEC ownership document");
  const issuer = root.issuer;
  const table = (t, derivative) => [
    ...list(t?.[derivative ? "derivativeTransaction" : "nonDerivativeTransaction"]).map(x => line(x, derivative, false)),
    ...list(t?.[derivative ? "derivativeHolding" : "nonDerivativeHolding"]).map(x => line(x, derivative, true))
  ];
  return {
    schemaVersion: text(root.schemaVersion),
    form: text(root.documentType),
    periodOfReport: text(root.periodOfReport),
    originalFiledOn: text(root.dateOfOriginalSubmission),
    notSubjectToSection16: yes(root.notSubjectToSection16),
    // Checked when a reported transaction was made under a Rule 10b5-1 plan (forms filed from April 2023); null when the form has no such box.
    rule10b51: root.aff10b5One == null ? null : yes(root.aff10b5One),
    issuer: { cik: text(issuer.issuerCik), name: text(issuer.issuerName), ticker: text(issuer.issuerTradingSymbol) },
    owners: list(root.reportingOwner).map(o => {
      const id = o?.reportingOwnerId, a = o?.reportingOwnerAddress, r = o?.reportingOwnerRelationship;
      return {
        cik: text(id?.rptOwnerCik), name: text(id?.rptOwnerName),
        address: [text(a?.rptOwnerStreet1), text(a?.rptOwnerStreet2), [text(a?.rptOwnerCity), text(a?.rptOwnerState), text(a?.rptOwnerZipCode)].filter(Boolean).join(" ") || null, text(a?.rptOwnerStateDescription)].filter(Boolean),
        director: yes(r?.isDirector), officer: yes(r?.isOfficer), tenPercentOwner: yes(r?.isTenPercentOwner), other: yes(r?.isOther),
        officerTitle: text(r?.officerTitle), otherText: text(r?.otherText)
      };
    }),
    nonDerivative: table(root.nonDerivativeTable, false),
    derivative: table(root.derivativeTable, true),
    footnotes: list(root.footnotes?.footnote).map(f => ({ id: f?.["@_id"], text: text(f) })).filter(f => typeof f.id === "string" && FOOTNOTE.test(f.id) && f.text),
    remarks: text(root.remarks),
    signatures: list(root.ownerSignature).map(s => ({ name: text(s?.signatureName), date: text(s?.signatureDate) })).filter(s => s.name || s.date)
  };
}

const xmlUrlOf = f => [f.xml_url, f.source_url].find(u => typeof u === "string" && /\.xml$/i.test(new URL(u, "https://x").pathname) && allowedSecUrl(u)) || null;
/* The filing's folder on EDGAR (the SEC's own index of every document in it). */
export function indexUrl(f) {
  const m = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//.exec(String(f?.xml_url || f?.source_url || ""));
  return m ? `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2]}/` : null;
}

/* The document for one parsed filing: from sec_documents, or fetched from SEC.gov once and kept. */
export async function filingDocument(query, accession, { fetcher = secFetch } = {}) {
  const f = (await query("SELECT * FROM sec_filings WHERE accession=$1 AND ingest_status='parsed'", [accession])).rows[0];
  if (!f) return null;
  const url = xmlUrlOf(f);
  let row = (await query("SELECT xml,xml_url,fetched_at FROM sec_documents WHERE accession=$1", [accession])).rows[0];
  if (!row && url) {
    const xml = await fetcher(url);
    if (typeof xml !== "string" || !xml.includes("ownershipDocument")) throw Object.assign(new Error("The SEC did not return this filing's document"), { status: 502 });
    row = (await query(`INSERT INTO sec_documents(accession,xml_url,xml) VALUES($1,$2,$3)
      ON CONFLICT (accession) DO UPDATE SET xml_url=EXCLUDED.xml_url RETURNING xml,xml_url,fetched_at`, [accession, url, xml])).rows[0];
  }
  return {
    filing: { accession: f.accession, form: f.form_type, ticker: f.ticker, issuerName: f.issuer_name, issuerCik: f.issuer_cik, publishedAt: f.published_at, isAmendment: f.is_amendment },
    document: row ? readOwnershipDocument(row.xml) : null,
    sourceUrl: row?.xml_url || url || f.source_url, indexUrl: indexUrl(f), retrievedAt: row?.fetched_at || null
  };
}

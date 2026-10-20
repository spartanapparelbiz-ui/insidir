/* The research engine: factual events derived from imported public records (sec_events, sql/015).
 *
 * Built after each SEC import, incrementally (a cursor on sec_filings.retrieved_at), and idempotently (each event has
 * a deterministic event_key; rebuilding writes the same rows):
 *
 *   insider_purchase / insider_sale   one per Form 4 and direction: the filing's open-market purchase lines (code P,
 *                                     acquired, non-derivative) or sale lines (code S, disposed, non-derivative),
 *                                     figures summed exactly as filed
 *   form4_amendment                   a Form 4/A compared line by line with the latest earlier filing for the same
 *                                     issuer, reporting owners and period: lines unchanged, changed (with the values
 *                                     before and after), added and removed. Restated lines do not become new
 *                                     purchase/sale events; changed or added ones do (marked amended), and the earlier
 *                                     event they correct is marked superseded
 *   multi_insider_purchase            two or more distinct reporting owners (a joint filing counts once) with reported
 *                                     open-market purchases at one issuer whose trade dates chain within 14 days, over
 *                                     at most 30 days; a new event each time the number of distinct owners grows
 *   company_disclosure                8-K, 10-K, 10-Q, 13D/G, proxy and other filings of watched companies, read from
 *                                     the SEC submissions API on a slow schedule within the shared SEC rate limit
 *
 * Every event keeps the transaction date(s), the SEC filing time and Insidir's retrieval time apart, links every
 * accession and source document, and states what it is not (facts.caveats). Nothing here scores, ranks, predicts or
 * recommends; the words used for each event (eventSummary) state what was filed. */
import { eventHeadline } from "./plain-language.mjs";
import { secFetch } from "./sec.mjs";
import { secReady } from "./config.mjs";
import { tickerIndex, tickerRecord, extractFilings } from "./intelligence.mjs";
import { ownerRoles } from "./insiders.mjs";

export const CLUSTER_GAP_DAYS = 14, CLUSTER_SPAN_DAYS = 30, CLUSTER_LOOKBACK_DAYS = 120;
export const CAVEATS = Object.freeze({
  form4: "Form 4 reports a transaction after it happens (usually within two business days); the trade date and the filing date differ.",
  notAdvice: "A factual summary of a public filing. Not a recommendation, forecast or statement about why the person traded.",
  cluster: "Groups reported purchases by distinct reporting owners. It does not mean the owners acted together or for the same reason, and it is not a forecast.",
  coverage: "Covers only filings in Insidir's import; filings that were not imported (or failed to parse) are not counted.",
  disclosure: "A list entry from SEC EDGAR. Read the filing itself for its content."
});

/* ---------- exact decimal sums (NUMERIC strings from pg; never through floating point) ---------- */
const SCALE = 8n, UNIT = 10n ** SCALE;
const toUnits = v => {
  if (v == null || v === "") return null;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(v).trim());
  if (!m) return null;
  const units = BigInt(m[2]) * UNIT + BigInt(((m[3] || "") + "00000000").slice(0, 8));
  return m[1] ? -units : units;
};
const fromUnits = u => {
  if (u == null) return null;
  const neg = u < 0n, a = neg ? -u : u;
  const frac = (a % UNIT).toString().padStart(8, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + (a / UNIT).toString() + (frac ? "." + frac : "");
};
export function decimalSum(values) {
  let total = 0n, any = false;
  for (const v of values) { const u = toUnits(v); if (u == null) continue; total += u; any = true; }
  return any ? fromUnits(total) : null;
}
const dec = v => v == null ? null : fromUnits(toUnits(v));
// pg returns DATE columns as a Date at local midnight: read its local calendar day. Timestamps are read in UTC (utcDay).
const pad = n => String(n).padStart(2, "0");
const isoDate = v => v == null ? null : v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10);
const utcDay = v => { if (v == null) return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const bare = cik => String(cik ?? "").replace(/^0+/, "");
const dayDiff = (a, b) => Math.round((Date.parse(isoDate(a)) - Date.parse(isoDate(b))) / 86400000);

/* ---------- Form 4 events ---------- */
const FILINGS_AFTER = `SELECT accession,issuer_cik,issuer_name,ticker,published_at,retrieved_at,is_amendment,period_of_report,source_url,xml_url,form_type,owner_names,validation_status
  FROM sec_filings WHERE ingest_status='parsed' AND (retrieved_at,accession)>($1::timestamptz,$2::text) ORDER BY retrieved_at,accession LIMIT $3`;
// A filing that failed validation (sec_filings.validation_status='flagged') becomes no event, so it can never be an alert.
const flagged = f => f.validation_status === "flagged";
const LINES_OF = `SELECT accession,id,owner_cik,owner_name,transaction_date,security_title,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,direct_ownership
  FROM sec_transactions WHERE accession=ANY($1::text[]) ORDER BY accession,id`;
const OWNERS_OF = `SELECT accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner,other_text
  FROM sec_filing_owners WHERE accession=ANY($1::text[])`;
// The latest earlier version of what a 4/A amends: same issuer, an overlapping reporting owner, same period.
const PRIOR_VERSION = `SELECT accession,published_at FROM sec_filings
  WHERE ingest_status='parsed' AND accession<>$1 AND LTRIM(issuer_cik,'0')=LTRIM($2,'0') AND period_of_report IS NOT DISTINCT FROM $3::date
    AND owner_names && $4::text[] AND (published_at<$5 OR (published_at=$5 AND accession<$1))
  ORDER BY published_at DESC NULLS LAST,accession DESC LIMIT 1`;

const isTrade = l => !l.derivative && ((l.category === "reported_purchase") || (l.category === "reported_sale"));
// A transaction's identity inside one owner's filings; its figures are compared separately.
const identity = l => [isoDate(l.transaction_date) || "", l.transaction_code || "", l.acquired_disposed || "", String(!!l.derivative), String(l.security_title || "").trim().toLowerCase()].join("|");
const figures = l => ({ shares: dec(l.shares), pricePerShare: dec(l.price_per_share), value: dec(l.estimated_value) });
const sameFigures = (a, b) => dec(a.shares) === dec(b.shares) && dec(a.price_per_share) === dec(b.price_per_share);
const lineFact = l => ({ id: l.id, transactionDate: isoDate(l.transaction_date), code: l.transaction_code, acquiredDisposed: l.acquired_disposed,
  security: l.security_title || null, derivative: !!l.derivative, ...figures(l), ownership: l.direct_ownership || null });

function ownersFor(filing, lines, ownerRows) {
  const rows = ownerRows.filter(o => o.accession === filing.accession);
  if (rows.length) {
    const order = filing.owner_names || [];
    return rows.sort((a, b) => order.indexOf(a.owner_name) - order.indexOf(b.owner_name))
      .map(o => ({ cik: o.owner_cik, name: o.owner_name, roles: ownerRoles({ isOfficer: o.is_officer, officerTitle: o.officer_title, isDirector: o.is_director, isTenPercentOwner: o.is_ten_percent_owner, otherText: o.other_text }) }));
  }
  const first = lines[0];
  return first ? [{ cik: first.owner_cik || null, name: first.owner_name, roles: [] }] : [];
}

function tradeEvent(filing, owners, category, lines, { amended = false, amends = null } = {}) {
  const dates = lines.map(l => isoDate(l.transaction_date)).filter(Boolean).sort();
  const prices = lines.map(l => toUnits(l.price_per_share)).filter(v => v != null).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const single = owners.length === 1 ? owners[0] : null;
  const published = filing.published_at;
  return {
    event_key: `form4:${filing.accession}:${category === "reported_purchase" ? "P" : "S"}`,
    event_type: category === "reported_purchase" ? "insider_purchase" : "insider_sale",
    issuer_cik: filing.issuer_cik, ticker: filing.ticker, issuer_name: filing.issuer_name,
    owner_cik: single?.cik || null, owner_name: owners.map(o => o.name).join(", ") || lines[0]?.owner_name || null,
    transaction_date: dates[0] || null, transaction_date_end: dates.at(-1) || null,
    filing_date: published, ingested_at: filing.retrieved_at,
    reporting_lag_days: dates.at(-1) && published ? dayDiff(utcDay(published), dates.at(-1)) : null,
    accessions: [filing.accession], source_urls: [filing.source_url, filing.xml_url].filter(Boolean),
    people: owners.map(o => o.cik).filter(Boolean),
    facts: {
      form: filing.form_type, owners, joint: owners.length > 1,
      lines: lines.map(lineFact), lineCount: lines.length,
      totalShares: decimalSum(lines.map(l => l.shares)), totalValue: decimalSum(lines.map(l => l.estimated_value)),
      valueComplete: lines.every(l => l.estimated_value != null),
      priceLow: prices.length ? fromUnits(prices[0]) : null, priceHigh: prices.length ? fromUnits(prices.at(-1)) : null,
      amended, amends, periodOfReport: isoDate(filing.period_of_report),
      caveats: [CAVEATS.form4, CAVEATS.notAdvice]
    }
  };
}

/* The comparison of a 4/A with the earlier version it amends. */
export function compareVersions(before, after) {
  const index = new Map();
  for (const l of before) { const k = identity(l); if (!index.has(k)) index.set(k, []); index.get(k).push(l); }
  const unchanged = [], changed = [], added = [];
  for (const l of after) {
    const list = index.get(identity(l));
    if (!list?.length) { added.push(l); continue; }
    const exact = list.findIndex(p => sameFigures(p, l));
    const prior = exact >= 0 ? list.splice(exact, 1)[0] : list.shift();
    (exact >= 0 ? unchanged : changed).push(exact >= 0 ? l : { before: prior, after: l });
  }
  const removed = [...index.values()].flat();
  return { unchanged, changed, added, removed };
}

const UPSERT = `INSERT INTO sec_events(event_key,event_type,issuer_cik,ticker,issuer_name,owner_cik,owner_name,transaction_date,transaction_date_end,
    filing_date,ingested_at,reporting_lag_days,accessions,source_urls,facts)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  ON CONFLICT (event_key) DO UPDATE SET issuer_cik=EXCLUDED.issuer_cik,ticker=EXCLUDED.ticker,issuer_name=EXCLUDED.issuer_name,owner_cik=EXCLUDED.owner_cik,
    owner_name=EXCLUDED.owner_name,transaction_date=EXCLUDED.transaction_date,transaction_date_end=EXCLUDED.transaction_date_end,filing_date=EXCLUDED.filing_date,
    ingested_at=EXCLUDED.ingested_at,reporting_lag_days=EXCLUDED.reporting_lag_days,accessions=EXCLUDED.accessions,source_urls=EXCLUDED.source_urls,facts=EXCLUDED.facts,
    updated_at=CASE WHEN sec_events.facts IS DISTINCT FROM EXCLUDED.facts THEN now() ELSE sec_events.updated_at END
  RETURNING id,(xmax=0) AS inserted`;

export async function saveEvent(query, e) {
  const r = await query(UPSERT, [e.event_key, e.event_type, e.issuer_cik ?? null, e.ticker ?? null, e.issuer_name ?? null, e.owner_cik ?? null, e.owner_name ?? null,
    e.transaction_date ?? null, e.transaction_date_end ?? null, e.filing_date ?? null, e.ingested_at ?? null, e.reporting_lag_days ?? null,
    e.accessions, e.source_urls, JSON.stringify(e.facts)]);
  const { id, inserted } = r.rows[0];
  for (const cik of new Set((e.people || []).map(c => String(c).padStart(10, "0")).filter(c => /^\d{10}$/.test(c))))
    await query("INSERT INTO sec_event_people(event_id,owner_cik) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, cik]);
  return { id: Number(id), inserted };
}

/* One pass over newly parsed filings. Returns counts and the issuers touched (for clusters). */
export async function buildForm4Events({ query, limit = 400 }) {
  const cursor = (await query("SELECT position,last_key FROM research_cursors WHERE name='form4'")).rows[0] || { position: new Date(0), last_key: "" };
  const filings = (await query(FILINGS_AFTER, [cursor.position, cursor.last_key, limit])).rows;
  const out = { filings: filings.length, created: 0, updated: 0, amendments: 0, superseded: 0, issuers: new Set() };
  if (!filings.length) return { ...out, issuers: [] };
  const accessions = filings.map(f => f.accession);
  const lines = (await query(LINES_OF, [accessions])).rows;
  const ownerRows = (await query(OWNERS_OF, [accessions])).rows;
  const byFiling = new Map(accessions.map(a => [a, []]));
  for (const l of lines) byFiling.get(l.accession)?.push(l);
  const count = r => { if (r.inserted) out.created++; else out.updated++; };

  for (const f of filings) {
    if (flagged(f)) { out.flagged = (out.flagged || 0) + 1; continue; }
    const own = byFiling.get(f.accession) || [];
    const owners = ownersFor(f, own, ownerRows);
    let tradeLines = own.filter(isTrade), amends = null, amendedSet = null;
    if (f.is_amendment) {
      const prior = (await query(PRIOR_VERSION, [f.accession, f.issuer_cik, f.period_of_report, f.owner_names || [], f.published_at])).rows[0];
      const priorLines = prior ? (await query(LINES_OF, [[prior.accession]])).rows : [];
      const diff = compareVersions(priorLines, own);
      amends = prior?.accession || null;
      count(await saveEvent(query, {
        event_key: `amendment:${f.accession}`, event_type: "form4_amendment", issuer_cik: f.issuer_cik, ticker: f.ticker, issuer_name: f.issuer_name,
        owner_cik: owners.length === 1 ? owners[0].cik : null, owner_name: owners.map(o => o.name).join(", ") || null,
        transaction_date: null, transaction_date_end: null, filing_date: f.published_at, ingested_at: f.retrieved_at, reporting_lag_days: null,
        accessions: [f.accession, ...(prior ? [prior.accession] : [])], source_urls: [f.source_url, f.xml_url].filter(Boolean), people: owners.map(o => o.cik).filter(Boolean),
        facts: { form: f.form_type, owners, amends, originalInImport: !!prior, periodOfReport: isoDate(f.period_of_report),
          unchanged: diff.unchanged.length, changed: diff.changed.map(c => ({ before: lineFact(c.before), after: lineFact(c.after) })),
          added: diff.added.map(lineFact), removed: prior ? diff.removed.map(lineFact) : [],
          caveats: [prior ? "Compared with the latest earlier filing for the same issuer, reporting owner and period in Insidir's import." : "The filing this amends is not in Insidir's import, so what changed cannot be shown.", CAVEATS.notAdvice] }
      }));
      out.amendments++;
      if (prior) {
        // Restated lines are the same facts already on record: only changed and added lines become (amended) events.
        amendedSet = new Set([...diff.changed.map(c => c.after.id), ...diff.added.map(l => l.id)]);
        tradeLines = tradeLines.filter(l => amendedSet.has(l.id));
        const corrected = new Set([...diff.changed.map(c => c.before.category), ...diff.removed.map(l => l.category)]);
        for (const category of corrected) {
          if (category !== "reported_purchase" && category !== "reported_sale") continue;
          const r = await query(`UPDATE sec_events SET status='superseded',superseded_by=$2,updated_at=now() WHERE event_key=$1 AND status='active'`,
            [`form4:${prior.accession}:${category === "reported_purchase" ? "P" : "S"}`, f.accession]);
          out.superseded += r.rowCount || 0;
        }
      }
    }
    for (const category of ["reported_purchase", "reported_sale"]) {
      const subset = tradeLines.filter(l => l.category === category);
      if (!subset.length) continue;
      count(await saveEvent(query, tradeEvent(f, owners, category, subset, { amended: !!f.is_amendment, amends })));
      if (category === "reported_purchase") out.issuers.add(f.issuer_cik);
    }
  }
  const last = filings.at(-1);
  await query(`INSERT INTO research_cursors(name,position,last_key,updated_at) VALUES('form4',$1,$2,now())
    ON CONFLICT(name) DO UPDATE SET position=EXCLUDED.position,last_key=EXCLUDED.last_key,updated_at=now()`, [last.retrieved_at, last.accession]);
  return { ...out, issuers: [...out.issuers] };
}

/* ---------- multi-insider purchase groups ---------- */
const reporterKey = e => e.owner_cik ? "cik:" + bare(e.owner_cik) : "joint:" + (e.facts?.owners || []).map(o => bare(o.cik)).sort().join("+");

/* Chains of purchase events (sorted by first trade date): a chain continues while the next trade is within GAP days of
 * the previous one and within SPAN days of the chain's first. Pure, for tests. */
export function purchaseChains(events, { gapDays = CLUSTER_GAP_DAYS, spanDays = CLUSTER_SPAN_DAYS } = {}) {
  const sorted = [...events].filter(e => e.transaction_date).sort((a, b) => isoDate(a.transaction_date).localeCompare(isoDate(b.transaction_date)) || String(a.event_key).localeCompare(String(b.event_key)));
  const chains = [];
  let chain = null;
  for (const e of sorted) {
    const d = isoDate(e.transaction_date);
    if (chain && dayDiff(d, chain.lastDate) <= gapDays && dayDiff(d, chain.start) <= spanDays) { chain.events.push(e); chain.lastDate = d; }
    else { chain = { start: d, lastDate: d, events: [e] }; chains.push(chain); }
  }
  return chains.map(c => ({ ...c, reporters: [...new Set(c.events.map(reporterKey))] }));
}

export async function buildPurchaseGroups({ query, issuers }) {
  const out = { issuers: 0, created: 0, superseded: 0 };
  for (const issuer of new Set(issuers || [])) {
    out.issuers++;
    const events = (await query(`SELECT id,event_key,issuer_cik,ticker,issuer_name,owner_cik,owner_name,transaction_date,transaction_date_end,filing_date,ingested_at,accessions,source_urls,facts
      FROM sec_events WHERE event_type='insider_purchase' AND status='active' AND LTRIM(issuer_cik,'0')=LTRIM($1,'0')
        AND transaction_date>=current_date-$2::integer ORDER BY transaction_date`, [issuer, CLUSTER_LOOKBACK_DAYS])).rows;
    for (const chain of purchaseChains(events)) {
      const n = chain.reporters.length;
      if (n < 2) continue;
      const evs = chain.events, latest = evs.reduce((a, b) => new Date(b.filing_date) > new Date(a.filing_date) ? b : a);
      const owners = [];
      for (const key of chain.reporters) {
        const e = evs.find(x => reporterKey(x) === key);
        owners.push({ key, names: (e.facts?.owners || []).map(o => o.name), ciks: (e.facts?.owners || []).map(o => o.cik).filter(Boolean), roles: (e.facts?.owners || []).flatMap(o => o.roles || []) });
      }
      const keyBase = `cluster:${bare(issuer)}:${chain.start}`;
      const r = await saveEvent(query, {
        event_key: `${keyBase}:${n}`, event_type: "multi_insider_purchase", issuer_cik: latest.issuer_cik, ticker: latest.ticker, issuer_name: latest.issuer_name,
        owner_cik: null, owner_name: null, transaction_date: chain.start, transaction_date_end: chain.lastDate,
        filing_date: latest.filing_date, ingested_at: latest.ingested_at, reporting_lag_days: null,
        accessions: [...new Set(evs.flatMap(e => e.accessions))], source_urls: [...new Set(evs.flatMap(e => e.source_urls))],
        people: owners.flatMap(o => o.ciks),
        facts: { distinctReportingOwners: n, owners, purchases: evs.map(e => ({ accession: e.accessions[0], owner: e.owner_name, transactionDate: isoDate(e.transaction_date),
            filingDate: e.filing_date, totalShares: e.facts?.totalShares ?? null, totalValue: e.facts?.totalValue ?? null })),
          totalValue: decimalSum(evs.map(e => e.facts?.totalValue)), valueComplete: evs.every(e => e.facts?.valueComplete !== false),
          method: `Open-market purchases (code P, non-derivative) by distinct reporting owners whose trade dates chain within ${CLUSTER_GAP_DAYS} days, over at most ${CLUSTER_SPAN_DAYS} days. A joint filing counts as one owner.`,
          caveats: [CAVEATS.cluster, CAVEATS.coverage, CAVEATS.form4] }
      });
      if (r.inserted) out.created++;
      const s = await query(`UPDATE sec_events SET status='superseded',superseded_by=$2,updated_at=now()
        WHERE event_type='multi_insider_purchase' AND status='active' AND event_key LIKE $1 AND event_key<>$2`, [keyBase + ":%", `${keyBase}:${n}`]);
      out.superseded += s.rowCount || 0;
    }
  }
  return out;
}

/* ---------- company disclosures for watched companies ---------- */
export async function pollCompanyDisclosures({ query, fetcher = secFetch, maxCompanies = 20, everyHours = 6, lookbackDays = 45 }) {
  const out = { companies: 0, checked: 0, created: 0, failed: 0 };
  if (fetcher === secFetch && !secReady()) return { ...out, skipped: "sec_user_agent_not_configured" };
  const tickers = (await query("SELECT DISTINCT ticker FROM watchlist ORDER BY ticker LIMIT 2000")).rows.map(r => r.ticker);
  if (!tickers.length) return out;
  const index = await tickerIndex(fetcher);
  for (const t of tickers) {
    const rec = tickerRecord(index, t);
    if (rec) await query("INSERT INTO disclosure_sources(issuer_cik,ticker) VALUES($1,$2) ON CONFLICT(issuer_cik) DO UPDATE SET ticker=EXCLUDED.ticker", [rec.cik, t]);
  }
  out.companies = tickers.length;
  const due = (await query(`SELECT issuer_cik,ticker,baseline_at FROM disclosure_sources WHERE ticker=ANY($1::text[])
    AND (last_checked_at IS NULL OR last_checked_at<now()-($2::integer*interval '1 hour')) ORDER BY last_checked_at NULLS FIRST LIMIT $3`, [tickers, everyHours, maxCompanies])).rows;
  for (const src of due) {
    out.checked++;
    try {
      const submissions = await fetcher(`https://data.sec.gov/submissions/CIK${src.issuer_cik}.json`, { json: true });
      const recent = submissions?.filings?.recent || {};
      const accepted = new Map((recent.accessionNumber || []).map((a, i) => [a, recent.acceptanceDateTime?.[i]]));
      const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
      for (const f of extractFilings(submissions, src.issuer_cik, 60)) {
        if (f.filedAt < cutoff || /^4(\/A)?$/.test(f.form)) continue;
        const acceptedAt = accepted.get(f.accession);
        const r = await saveEvent(query, {
          event_key: `disclosure:${f.accession.replace(/-/g, "")}`, event_type: "company_disclosure", issuer_cik: src.issuer_cik, ticker: src.ticker,
          issuer_name: typeof submissions?.name === "string" ? submissions.name.slice(0, 150) : null, owner_cik: null, owner_name: null,
          transaction_date: null, transaction_date_end: null, filing_date: acceptedAt && !Number.isNaN(Date.parse(acceptedAt)) ? acceptedAt : f.filedAt + "T00:00:00Z",
          ingested_at: new Date().toISOString(), reporting_lag_days: null, accessions: [f.accession.replace(/-/g, "")], source_urls: [f.sourceUrl].filter(Boolean),
          facts: { form: f.form, headline: f.headline, items: f.items || [], filedAt: f.filedAt, reportDate: f.reportDate, baseline: !src.baseline_at, caveats: [CAVEATS.disclosure, CAVEATS.notAdvice] }
        });
        if (r.inserted) out.created++;
      }
      await query("UPDATE disclosure_sources SET last_checked_at=now(),last_ok_at=now(),baseline_at=COALESCE(baseline_at,now()),failures=0,last_error=NULL WHERE issuer_cik=$1", [src.issuer_cik]);
    } catch (e) {
      out.failed++;
      await query("UPDATE disclosure_sources SET last_checked_at=now(),failures=failures+1,last_error=$2 WHERE issuer_cik=$1", [src.issuer_cik, String(e?.message || e).slice(0, 200)]);
      if (/SEC responded 403/.test(String(e?.message))) break; // blocked: stop for this run (fair access)
    }
  }
  return out;
}

/* ---------- failed imports: retried with backoff after they leave EDGAR's current feed ---------- */
export async function retryFailedFilings({ query, load, persist, limit = 10, maxAttempts = 5 }) {
  const due = (await query(`SELECT accession,filer_cik,title,form_type,source_url,published_at FROM sec_filings
    WHERE ingest_status='error' AND attempts<$1 AND COALESCE(next_retry_at,updated_at+interval '15 minutes')<=now() ORDER BY COALESCE(next_retry_at,updated_at) LIMIT $2`, [maxAttempts, limit])).rows;
  const out = { due: due.length, recovered: 0, failed: 0 };
  for (const r of due) {
    const filing = { accession: r.accession, filerCik: r.filer_cik, title: r.title, formType: r.form_type, sourceUrl: r.source_url, publishedAt: r.published_at,
      indexBase: `https://www.sec.gov/Archives/edgar/data/${r.filer_cik}/${r.accession}/` };
    try { await persist(await load(filing)); out.recovered++; }
    catch (e) {
      out.failed++;
      await query(`UPDATE sec_filings SET error_message=$2,updated_at=now(),attempts=attempts+1,next_retry_at=now()+LEAST(interval '1 day',interval '15 minutes'*power(2,attempts)) WHERE accession=$1`,
        [r.accession, String(e?.message || e).slice(0, 500)]);
      if (/SEC responded 403/.test(String(e?.message))) break;
    }
  }
  return out;
}

/* After each import: Form 4 events (until caught up, bounded), then purchase groups for the issuers touched. */
export async function buildResearchEvents({ query, maxBatches = 10 }) {
  const total = { filings: 0, created: 0, updated: 0, amendments: 0, superseded: 0, groups: 0 };
  const issuers = new Set();
  for (let i = 0; i < maxBatches; i++) {
    const r = await buildForm4Events({ query });
    for (const k of ["filings", "created", "updated", "amendments", "superseded"]) total[k] += r[k];
    r.issuers.forEach(x => issuers.add(x));
    if (r.filings < 400) break;
  }
  const g = await buildPurchaseGroups({ query, issuers: [...issuers] });
  total.groups = g.created; total.superseded += g.superseded;
  return total;
}

/* ---------- reading ---------- */
export async function listResearchEvents(query, { ticker = null, ownerCik = null, types = null, limit = 50, before = null, includeSuperseded = false } = {}) {
  const params = [ticker, ownerCik ? String(ownerCik).padStart(10, "0") : null, types?.length ? types : null, before, Math.min(200, Math.max(1, limit)), includeSuperseded];
  const r = await query(`SELECT e.id,e.event_type,e.status,e.superseded_by,e.issuer_cik,e.ticker,e.issuer_name,e.owner_cik,e.owner_name,e.transaction_date,e.transaction_date_end,
      e.filing_date,e.ingested_at,e.detected_at,e.reporting_lag_days,e.accessions,e.source_urls,e.facts
    FROM sec_events e
    WHERE ($1::text IS NULL OR e.ticker=$1) AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM sec_event_people p WHERE p.event_id=e.id AND p.owner_cik=$2))
      AND ($3::text[] IS NULL OR e.event_type=ANY($3::text[])) AND ($4::bigint IS NULL OR e.id<$4) AND ($6::boolean OR e.status='active')
    ORDER BY e.filing_date DESC NULLS LAST,e.id DESC LIMIT $5`, params);
  return r.rows.map(e => ({ ...e, headline: eventHeadline(e), summary: eventSummary(e) }));
}

/* ---------- words: what was filed, never why or what to do ---------- */
// Figures exactly as filed, only grouped: never rounded (an explanation's figures must match its sources).
const group = v => { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v ?? "").trim()); if (!m) return null; const frac = (m[3] || "").replace(/0+$/, ""); return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : ""); };
const money = v => { const g = group(v); return g == null ? null : "$" + (/\.\d$/.test(g) ? g + "0" : g); };
const num = v => group(v);
const dayOf = (v, read) => v ? new Date(read(v) + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null;
const day = v => dayOf(v, isoDate), stamp = v => dayOf(v, utcDay);
const who = e => { const o = e.facts?.owners || []; const first = o[0]; if (!first) return e.owner_name || "A reporting owner"; const role = first.roles?.length ? ` (${first.roles.join(", ")})` : ""; return first.name + role + (o.length > 1 ? ` and ${o.length - 1} other reporting owner${o.length > 2 ? "s" : ""}` : ""); };

export function eventSummary(e) {
  const company = e.ticker || e.issuer_name || "the issuer", f = e.facts || {};
  const range = e.transaction_date && e.transaction_date_end && isoDate(e.transaction_date) !== isoDate(e.transaction_date_end) ? `${day(e.transaction_date)} to ${day(e.transaction_date_end)}` : day(e.transaction_date);
  const filed = stamp(e.filing_date);
  if (e.event_type === "insider_purchase" || e.event_type === "insider_sale") {
    const verb = e.event_type === "insider_purchase" ? "reported buying" : "reported selling";
    const price = f.priceLow == null ? "" : f.priceLow === f.priceHigh ? ` at ${money(f.priceLow)} a share` : ` at ${money(f.priceLow)} to ${money(f.priceHigh)} a share`;
    const value = f.totalValue != null ? `; reported value ${money(f.totalValue)}${f.valueComplete === false ? " (some lines have no price)" : ""}` : "";
    return `${who(e)} ${verb} ${num(f.totalShares) ?? "an unreported number of"} shares of ${company}${price} on ${range || "an unreported date"}${value}. ${f.amended ? "Amended Form 4" : "Form 4"} filed ${filed}.`;
  }
  if (e.event_type === "multi_insider_purchase")
    return `${f.distinctReportingOwners} distinct reporting owners reported open-market purchases of ${company} with trade dates from ${range}${f.totalValue != null ? `; combined reported value ${money(f.totalValue)}` : ""}. Latest filing ${filed}.`;
  if (e.event_type === "form4_amendment") {
    if (!f.originalInImport) return `${who(e)} filed an amended Form 4 for ${company} on ${filed}. The original filing is not in Insidir's import.`;
    const parts = [f.changed?.length ? `${f.changed.length} line${f.changed.length > 1 ? "s" : ""} changed` : null, f.added?.length ? `${f.added.length} added` : null, f.removed?.length ? `${f.removed.length} removed` : null].filter(Boolean);
    return `${who(e)} filed an amended Form 4 for ${company} on ${filed}: ${parts.length ? parts.join(", ") : "no transaction lines changed"} compared with the earlier filing.`;
  }
  if (e.event_type === "company_disclosure")
    return `${e.issuer_name || company} filed a ${f.form}${f.headline ? ` (${f.headline.toLowerCase()})` : ""} on ${f.filedAt ? day(f.filedAt) : stamp(e.filing_date)}${f.items?.length ? ": " + f.items.map(i => `Item ${i.code} ${i.label}`).join("; ") : ""}.`;
  return `${company}: event filed ${filed}.`;
}

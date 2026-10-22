# Coverage: what Insidir indexes, from where, and what it does not

Every number in this document's "how to measure" column is read from the database by `GET /v1/coverage` (public,
aggregate counts only) or `GET /v1/admin/ops` (operators; adds example rows for each data-quality check). Nothing is a
fixed figure. `scripts/coverage-validate.mjs` checks discovery of real entities against live SEC EDGAR.

## Sources

| Source | What it gives | How often | Code |
| --- | --- | --- | --- |
| SEC company ticker list, `https://www.sec.gov/files/company_tickers_exchange.json` | Listed companies: CIK, name, every ticker and exchange | Daily (`company-directory` worker) | `src/sec-directory.mjs` `syncCompanyDirectory` |
| EDGAR daily form index, `https://www.sec.gov/Archives/edgar/daily-index/YYYY/QTRn/form.YYYYMMDD.idx` | The SEC's own list of every Form 4 and 4/A disseminated each business day | Hourly, a few days per run, until the window is read; the last three days are re-read | `src/coverage-ingest.mjs` `syncDailyIndexes` |
| EDGAR current filings feed (Atom) | Newest Form 4 filings | About every 2 minutes (`sec-ingest`, `INSIDIR_INGEST_EVERY_MIN`) | `src/ingest.mjs` |
| Form 4 / 4/A ownership XML in EDGAR archives | Issuer, every reporting owner (joint filers included), relationships, transactions | Live feed about every 2 minutes; backfill queue every 5 minutes | `src/sec.mjs` `loadOwnership`, `src/coverage-ingest.mjs` `drainIngestQueue` |
| EDGAR submissions, `https://data.sec.gov/submissions/CIK##########.json` | SEC name, former names with dates, tickers, SIC, state, entity type, whether the CIK files ownership reports, recent filings | On demand (search by CIK, entity pages, follows) and a monthly re-read of every indexed CIK, 200 per ten minutes (`entity-profiles`) | `resolveEntity`, `refreshProfiles` |
| SEC filer list, `https://www.sec.gov/Archives/edgar/cik-lookup-data.txt` | Every name and CIK EDGAR has ever had a filing under (about a million: companies, people, funds, trusts), kept in `sec_filer_names` for search | Checked daily, re-read weekly (`filer-list`); read and inserted in batches of 5,000, never held whole; a list under 100,000 names is refused | `syncFilerList` |
| EDGAR entity lookup, `https://efts.sec.gov/LATEST/search-index?keysTyped=` | Names and CIKs of any EDGAR filer, companies and individuals | On demand, when a name search finds fewer than five strong local matches | `edgarEntityLookup` |

All requests go through the shared SEC client (`src/sec.mjs`): a declared User-Agent with a monitored email, an
allow-list of URLs, at most eight requests a second across every job, retries with backoff on 429 and 5xx, and a stop
on refusal. Background jobs hand their work back when people are waiting on the throttle.

## Entity types

- **Company**: on the SEC ticker list, an issuer on an imported Form 4, or an EDGAR "operating" filer. Companies keep
  every ticker they were seen with (`sec_ticker_history`); a company that leaves the ticker list is marked unlisted with
  the date, never deleted. A share class is a ticker of the same CIK (BRK-A and BRK-B are one company).
- **Reporting person / reporting entity**: a reporting owner (CIK) on a Form 4. Whether it is a person or an
  organization is read from the name as filed (words such as LLC, L.P., Fund, Trust, Capital), recorded as
  `kind_basis = filed_name_pattern`; the SEC has no field for it. Different CIKs are never merged, even with the same
  name: the data-quality check `possible_duplicate_people` counts them for review instead.
- **SEC filer (unknown)**: a CIK seen only in EDGAR's name lookup, until its submissions are read.

Relationships (director, officer and title, 10% owner, other) are only those stated on imported filings, each with a
link to the latest filing that states it.

## Window and backfill

`INSIDIR_COVERAGE_DAYS` (default 90) calendar days of Form 4 and 4/A. Each business day's EDGAR index is read and every
accession in it is queued once (`sec_ingest_queue`, keyed by accession). The queue is claimed with
`FOR UPDATE SKIP LOCKED`, so concurrent workers never take the same filing; transient errors retry with backoff (15
minutes, doubling, at most a day, six attempts); filings with no ownership XML fail after two attempts and stay in the
queue with the error; a worker that dies mid-row has the row recovered after 20 minutes. Reconciliation per day:
EDGAR listed = imported + failed + waiting + missing.

A person opened in Insidir whose insider filings predate the window has their own Form 4 and 4/A accessions (up to
100) queued as `on_demand`; the drain claims those before the backfill, so their trades appear within a run or two.

Backfilled filings are history: alerts and pushes go out only for filings the SEC published in the last three days.

## Not covered

- Forms 3 and 5, 13D/13G and Form 144 are not imported.
- Form 4 filings older than the window are not backfilled.
- Paper filings and filings without ownership XML cannot be parsed (they are counted as failed, with the reason).
- Companies that never registered with the SEC and people who never filed with it are not in EDGAR.
- Person vs organization for reporting owners is an inference from the filed name, labelled as such.
- Watchlists follow companies by ticker; a company without a ticker can be opened (entity.html) but not watchlisted.

## How to measure

- `GET /v1/coverage`: entities (companies, listed, unlisted, reporting owners, people, entities), filings (parsed,
  failed), queue states, backfill (EDGAR listed vs imported in the window), reconciliation per day, last successful run
  per job, data-quality counts. Shown on data.html.
- `GET /v1/admin/ops`: the same plus example rows for each data-quality check; ops.html renders it.
- `node scripts/coverage-validate.mjs`: real entities (share classes, a renamed company, companies without tickers, an
  acquired company, CIK and typo searches, an over-the-counter issuer, an individual reporting owner, joint filers,
  people at several issuers, corporate owners, a nonexistent CIK) against live EDGAR.

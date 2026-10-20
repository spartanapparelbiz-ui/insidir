# Financial accuracy: sources, calculations, validation

Every figure Insidir shows comes from a stored SEC record and links to it. This document lists where each kind of
figure comes from, how it is computed, what is checked before it is shown, and how that is tested.

## Sources of truth

| Figure | Source | Kept with it |
| --- | --- | --- |
| Insider transactions | Form 4 / 4/A ownership XML in EDGAR (`src/sec.mjs` `parseOwnership`) | accession, issuer CIK, owner CIKs, transaction and filing dates, code, A/D, shares and price as filed, ownership nature, timeliness mark, 10b5-1 mark, underlying security for derivatives, source URL, retrieval time, parser version, validation result |
| Financial statements | SEC XBRL company facts (`src/intelligence.mjs`) | concept (taxonomy:tag), period start and end, period type, form, accession, filing date, currency and unit |
| Institutional holdings | Form 13F-HR / 13F-HR/A information tables (`src/form13f.mjs`) | accession, period of report, filing date, value unit (dollars from 2023-01-03, thousands before), amendment type, completeness against the cover page totals |
| Companies and people | SEC ticker list, EDGAR submissions, EDGAR entity lookup, imported filings (`docs/COVERAGE.md`) | CIK, names with source, tickers with first and last seen |

Market prices come from a delayed third-party provider; they are labelled as delayed market data and are never used
as SEC figures. AI text is never the source of a figure.

## Calculations

- **Value of a Form 4 line**: shares × price exactly as filed, multiplied as decimals (BigInt over the filed strings)
  and rounded half-up to the cent (`filedValue`). A line with no price, or a price of zero (gifts, awards, grants,
  conversions), has **no value**, not $0.
- **Purchases and sales**: only non-derivative P with A (purchase) and S with D (sale). Awards, exercises, conversions,
  tax withholding, gifts and other codes are named in words and never counted as buying or selling. A sale is not
  described as bearish; a filing marked as made under a Rule 10b5-1 plan says so.
- **Joint filings**: a line filed by several reporting owners belongs to all of them and is counted once.
- **Amendments**: a 4/A names the filing it amends (`dateOfOriginalSubmission`); a line it restates is counted once,
  from the latest filing.
- **Derivative lines**: the count is of derivative securities (options, rights, units); the underlying shares and the
  exercise price are shown beside it, never substituted for it.
- **Latest financial fact**: for one end date a 10-Q reports both the quarter and the year to date. The quarter is
  chosen and every fact carries its period type (`quarter`, `year-to-date`, `fiscal-year`, `instant`) and length.
- **Trailing twelve months**: fiscal year + current year to date − prior year to date, from matched periods; otherwise
  the fiscal year, labelled as such. **EPS is never added across periods** (share counts differ): it is the fiscal
  year's reported diluted EPS.
- **13F**: values are normalised to dollars; option rows are excluded from portfolio weights; the period of report and
  the filing date are separate fields and shown separately.

## Validation before a record is used

`validateOwnership` (src/sec.mjs) runs on every parsed Form 4 and the result is stored on the filing
(`validation_status`, `validation_issues`):

- errors (the filing is **flagged**): accession not 18 digits, missing issuer CIK, source link not the accession's
  EDGAR folder, no reporting owner, a transaction dated before 1990 or after the filing, negative shares or price, an
  invalid acquired/disposed code, an amendment of a later filing, a period of report after the filing;
- warnings: a reporting owner without a CIK, a missing transaction date, an unusual code or a code whose direction
  disagrees with A/D.

A flagged filing is kept and shown with its reasons on the filing page; it becomes no research event, so it is never
an in-app alert or a push. Nothing is corrected or filled in. The data-quality counts on ops.html and in
`GET /v1/coverage` add database-wide checks (misclassified lines, value mismatches, broken links, duplicates,
staleness, failed imports, filings waiting to be re-read by a newer parser).

When the parser learns to read a new field, `PARSER_VERSION` is raised and every filing read by an older version is
queued again (`queueReparse`) and re-read from EDGAR through the import queue.

## Tests against original documents

- `test/form4-accuracy.test.mjs`: nine real Form 4 filings (purchase, 10b5-1 sale, rights exercise, gift, tax
  withholding, class conversion, ADS award, 4/A, a seventeen-line joint filing). Expected values were read by hand
  from each XML document.
- `test/xbrl-accuracy.test.mjs`: Apple's company facts against the figures in its filed 10-K (FY2025) and 10-Q (Q3
  FY2026) statements: the quarter vs year-to-date choice, TTM revenue and net income computed by hand, EPS not
  annualised by addition, annual series of full years only.
- `test/intelligence-platform.test.mjs` and `test/intelligence-db.test.mjs` with the 13F fixture: value units, amendments, completeness, storage and dedup.
- `test/compliance.test.mjs` and `test/explanations.test.mjs`: AI output is rejected when a fact cites nothing
  or a figure is not in the evidence it cites.

## Known limits

- Rows imported before parser version 2 have no 10b5-1 mark, timeliness, underlying security or validation result
  until they are re-read; the re-read runs in the background, newest first.
- Financial facts cover the concepts listed in `src/intelligence.mjs`; a company that reports revenue under another
  concept shows none rather than a guess.
- Restated figures: the latest filing for a period wins, and the filing is linked; earlier reported values are not
  shown side by side.

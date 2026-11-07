# Insidir V3: SEC research terminal

Status: **proposal (November 7, 2026).** Nothing in this file is built yet. It does not override docs/INSIDIR-V2.md
or docs/BRIEF.md until it is adopted. When it is, code comments cite it as `docs/INSIDIR-V3.md §N`.

## §0 Positioning (the copy, as given)

> **Insidir: SEC research terminal**
>
> Insider filings, financials and announcements straight from SEC EDGAR, on one dense screen. The data terminals
> charge $2,000+ a month for, at $39.
>
> **Modules**
> - Company reports: delayed price chart, trailing-twelve-month financials, filings and insider history on one page
> - SEC filings: a searchable Form 4 database, each row linked to the original filing on sec.gov
> - Insider activity: open-market buys and sells by officers and directors, kept separate from option exercises and
>   stock grants
> - People: officers, directors and 10% owners, across every board they sit on
> - Watchlists and alerts: save tickers and get an in-app alert the moment a new filing lands
> - Research journal: tag companies Researching, Watching or Passed, with private notes next to the filings
>
> Every number comes from an official SEC filing. No AI summaries, no price targets, nothing simulated.
>
> $39 a month. Cancel any time.
>
> Research software from Aethric LLC. Not a broker or investment adviser. Information, not advice.

This replaces the prediction-market product ("Bet with the people who actually win", lib/brand/copy.ts). Billing,
Whop, auth, accounts and the $39 plan (lib/plans.ts) carry over unchanged.

## §1 Copy issues to settle before it ships

Each of these is a line in §0 that is not true of what we have, or that needs a decision. Fix the copy or build the
thing; don't ship the line as is.

1. **"Every number comes from an official SEC filing" vs. "delayed price chart".** Prices don't come from the SEC.
   Change the line to "Every filing number comes from an official SEC filing; prices are delayed and labelled with
   their source", or drop the chart.
2. **Price licensing.** lib/stocks/prices.ts reads Stooq's CSV and Yahoo's chart API. docs/INSIDIR-V2.md §3a already
   found that no free daily price source we checked is licensed for commercial display. A paid chart is a product
   on a $39 subscription, so the chart needs a paid display license (e.g. a delayed-quotes vendor) before launch,
   or it ships wearing the Coming soon badge (V2 §2).
3. **"The data terminals charge $2,000+ a month for".** A comparison with competitors' prices is a factual claim.
   Keep it only with a dated, citable source for the number (e.g. a published list price), or reword to something
   that doesn't name a figure. The sentence also needs its grammar fixed: "…the data that terminals charge $2,000+
   a month for, at $39."
4. **"Announcements".** The modules list has no announcements module. Either add 8-K filings to the filings database
   and company report (§3, Filings) or drop the word.
5. **"The moment a new filing lands".** We poll EDGAR's current-filings feed (every 2 minutes today). Say "within
   minutes of a filing reaching EDGAR", or keep "the moment" only if the alert latency is measured and under a
   minute.
6. **"Not a broker or investment adviser."** Good, and it should replace the betting footer
   (components/brand/Nav.tsx, lib/brand/copy.ts LEGAL). Have counsel confirm the publisher's-exclusion wording,
   given watchlists and alerts are personalised.
7. **"No AI summaries"** means lib/research (the model-backed Research ask) and lib/analyst stay off the product, and
   test/compliance.test.ts should gain a check that no user-facing route calls them.
8. **Free tier.** The copy says $39 a month and nothing about a trial. lib/plans.ts TRIAL is $1 for 3 days. Decide:
   keep the trial and say so, or drop it (the Whop plan and `whop:setup`'s check change with it).

## §2 What already exists

The SEC engine from V2's Stocks tab is still in the repo. Its pages were retired in be8cfdcd (301s in
next.config.ts RETIRED: /stocks, /company, /insider-trading, /insiders, /funds, /research, /following, /alerts,
/terminal all go to /board).

| Piece | Where | State |
| --- | --- | --- |
| EDGAR client: SEC_USER_AGENT, ≤ 8 req/s, Retry-After, URL allowlist | lib/stocks/sec.ts | Kept, tested (test/stocks.test.ts). Allowlist covers submissions JSON, filing archives and the Form 4 Atom feed only. |
| Form 4 parsing (owners, roles, non-derivative lines) | lib/stocks/form4.ts | Kept. Stores only codes P and S. |
| Insider trade rows, one per filing line and owner | lib/stocks/history.ts, `terminal.insider_trades` | Kept. Indexed by owner, issuer, ticker, filed date. |
| Per-insider and per-company EDGAR backfill, with `completeSince` | `terminal.sec_history` | Kept, up to 10 years. Only queued for $100k+ buyers today. |
| 13F fund holdings | lib/stocks/form13f.ts, `funds`, `fund_filings`, `fund_holdings` | Kept. Not in the V3 copy. |
| Each filing read once | `terminal.sec_seen` | Kept. |
| Daily closes | lib/stocks/prices.ts, `stock_closes` | Kept, but see §1.2 (licence). |
| Name cleanup (title case, suffixes, share class) | lib/stocks/names.ts | Kept. |
| Profile maths (totals, company insiders this month) | lib/profiles/sec.ts | Kept, tested (test/sec-pages.test.ts). |
| Follows (`follows` table, kinds incl. insider/company/fund) | lib/follows.ts | Kept. Basis for watchlists. |
| Alerts: fanout, quiet hours, web push, email | lib/alerts/* | Kept. Built for deals and bets; needs a filing source. |
| Billing, Whop, auth, accounts, $39 plan | lib/billing, lib/auth, lib/plans.ts | Unchanged. |
| Old SEC pages | git show be8cfdcd^:app/insiders/[id]/page.tsx etc. | Deleted; recoverable from history as a starting point. |

## §3 Modules

Every number on every page links to the filing it came from (sec.gov). Every row shows when the filing became
public. Nothing is estimated, rounded into a different figure, or computed from a source other than the filing,
except the price chart (§1.1).

### Company reports (`/company/[ticker]`)

- Header: name as filed (lib/stocks/names.ts), ticker, CIK, exchange, SIC industry, fiscal year end, from
  `data.sec.gov/submissions/CIK##########.json`.
- Price chart: delayed daily closes, source and delay printed under it (§1.1, §1.2).
- Financials, trailing twelve months: revenue, operating income, net income, diluted EPS, operating cash flow,
  capex, cash, total debt, shares outstanding. From XBRL company facts
  (`data.sec.gov/api/xbrl/companyfacts/CIK##########.json`):
  - TTM = latest 10-K annual value + the year-to-date 10-Q values after it − the same periods a year earlier. If any
    piece is missing, show the latest annual figure labelled "FY 2025", never a partial TTM.
  - Each figure names its tag (us-gaap:Revenues…) and links to the filing (accession) it came from.
  - Revenue tags vary by company (Revenues, RevenueFromContractWithCustomerExcludingAssessedTax, SalesRevenueNet…):
    one ordered fallback list, tested against fixtures from at least 20 real companies.
- Filings: the latest 10-K, 10-Q, 8-K, DEF 14A, S-1, 13D/G and Form 4s, newest first, from the submissions JSON. 8-K
  rows show their item numbers (2.02 results, 5.02 officer changes…) as filed.
- Insider history: §3 Insider activity, scoped to the company.

### SEC filings (`/filings`)

- A searchable Form 4 database: every Form 4 we have read, filterable by ticker, company, person, role, transaction
  code, date range and value. Each row links to the filing on sec.gov.
- Coverage is stated on the page: "Every Form 4 filed since [date]". Backfill all issuers, not only $100k+ buyers
  (EDGAR's daily form index by date; at 8 req/s a full year is a few days of background reading).
- Store every transaction code, not just P and S (§4).
- Postgres full-text or trigram search on owner and company names; the existing indexes cover ticker and date.

### Insider activity (`/insiders`)

- Open-market trades only by default: code P (buy) and S (sale), non-derivative.
- Everything else in its own tab, never summed with open-market trades:
  - M option exercises, A grants and awards, F tax withholding, G gifts, C conversions, D dispositions to the issuer,
    and the rest, labelled with the SEC's own wording.
- 10b5-1 plan trades marked as such when the filing's checkbox (filed since April 2023) or footnote says so.
- Totals per company and per person: bought, sold, net, number of insiders buying, over 30 / 90 / 365 days.

### People (`/people/[cik]`)

- Officers, directors and 10% owners, by reporting-owner CIK, with every issuer they file for (every board they sit
  on, as far as Form 3/4/5 show it). Name as filed, put in normal order; relationship and officer title as filed.
- Their trades across companies, open-market and other kept apart, as above.
- Only what the filings say: no photos, no biographies from other sources, no inferred net worth.

### Watchlists and alerts

- Save tickers (and people) to one or more watchlists. `follows` already has `company` and `insider` kinds
  (lib/follows.ts SEC_KINDS), which cover one unnamed list; add `watchlists` + `watchlist_items` if named lists are
  wanted.
- In-app alert when a new filing for a watched ticker or person reaches EDGAR: an alerts inbox with an unread count
  in the nav. Web push and email reuse lib/alerts as options, not the default.
- Which forms alert is the user's choice (Form 4 only, or also 8-K, 10-Q, 10-K, 13D/G).
- Alert latency is measured (filing acceptance time → alert created) and shown on /status (§1.5).

### Research journal

- Per user, per company: a status (Researching, Watching, Passed) and private notes, shown beside the company's
  filings and on a `/journal` list sortable by status and last edit.
- New table `journal_entries (user_id, issuer_cik, status, note, updated_at)`; notes are plain text, private, never
  indexed, never shared, deleted with the account.

## §4 Data changes

- lib/stocks/form4.ts and history.ts: keep every non-derivative and derivative line with its transaction code,
  acquired/disposed flag, shares, price, post-transaction holdings, direct/indirect ownership and footnotes.
  `insider_trades.code` widens from `"P" | "S"` to the SEC code set; add `derivative`, `owned_after`, `direct`,
  `plan_10b5_1`. Migration in drizzle/.
- Forms 3 and 5 for the People module (initial holdings and annual reports).
- Amendments (4/A): V2 skipped them. A research database should show them, linked to the filing they amend, and the
  amended figures should replace the original's in totals.
- lib/stocks/sec.ts allowedSecUrl: add `data.sec.gov/api/xbrl/companyfacts/CIK##########.json`, the daily form
  index (`/Archives/edgar/daily-index/…`) and the current-filings feed for the other alerting forms. Same throttle.
- New tables: `companies` (CIK, name, tickers, SIC, fiscal year end, refreshed_at), `company_facts` (CIK, tag,
  period, value, unit, accession), `filings` (accession, CIK, form, filed_at, items, url), `journal_entries`, and
  the watchlist tables if named lists are wanted.

## §5 What goes

- The prediction-market product: board, millionaire bets, wallets, races, copies, autopilot, Kalshi twins, price
  gaps, and their worker jobs. Retire the routes with 301s to the nearest V3 page (or the landing), the same way
  be8cfdcd did, and stop the jobs before deleting their tables.
- lib/research and lib/analyst (model-backed): off (§1.7).
- Betting copy and its compliance rules (18+, problem-gambling line, "bankroll") give way to research-software
  rules: no "buy", "sell signal", price targets, "guaranteed", or anything implying inside information. Update
  test/compliance.test.ts and test/moves.test.ts BANNED_WORDS together with the copy.

## §6 Build order

Each step ships on its own, behind the Coming soon rule (V2 §2) until it passes its tests and a 20-row accuracy
check re-read from EDGAR (V2 §12, extended to V3 tables).

1. Data: widen Form 4 storage (§4), backfill all issuers, `filings` table. No new pages.
2. SEC filings database (`/filings`) and Insider activity (`/insiders`).
3. Company reports without the chart: header, filings, insider history, TTM financials.
4. People.
5. Watchlists and in-app alerts.
6. Research journal.
7. New landing and pricing with the §0 copy, as corrected under §1; retire the betting product (§5).
8. Price chart, once a display licence is in place.

## §7 Open decisions

- Trial or no trial (§1.8).
- Keep 13F fund holdings as a module? They're built, and not in the copy.
- Price data vendor and its cost (§1.2), which sets whether $39 still works.
- The $2,000+ comparison: keep with a source, or reword (§1.3).
- What happens to current members of the betting product: migrate, refund, or a notice period.

# Insider edge: plan and schema

Goal: Insidir is the best product for following corporate insider trades (SEC Form 4). Not in scope: options flow,
dark pools, or anything that is not an insider's own filing. Every number links to its SEC filing through the
existing Evidence shape (`src/evidence.mjs`); every page keeps "Research, not investment advice."

Built in this order; each feature is shown (UI and logic) before the next starts.

## What exists today (the data model this builds on)

| Table | What it holds | Used for |
| --- | --- | --- |
| `sec_filings` | one row per Form 4 accession: issuer, ticker, published_at, `rule_10b5_1`, validation | the filing link on every figure |
| `sec_transactions` | one row per Form 4 line: owner CIK/name, date, code (P, S, A, G, F, M…), shares, price, value, `shares_after`, `derivative`, `source_url` | trades, sizes, holdings after the trade |
| `sec_filing_owners` | every reporting owner of a filing (joint filings) | attributing joint lines |
| `watchlist`, `followed_people` (+ `alert_mode`) | what a member follows | alerts, digests |
| `sec_events`, `notifications`, `push_subscriptions`, `email_outbox` | research events, fan-out, push, email | alerts |
| `market.mjs` | delayed Yahoo Finance chart data, in memory only | company price charts |

Gaps: no stored daily prices, so nothing can say how a stock did after a trade; no per-trade score; alerts fire on
every event type rather than on how notable the trade is.

## 1. Insider track record (headline, Pro) — built in this change

How the stock did 1, 3 and 6 months after each past open-market buy (code P) and sell (code S), and a hit rate:
"6 of their last 8 buys were up 3 months later". On the person page, and as one line on every trade card.

Logic (`src/track-record.mjs`, pure functions, unit-tested):
- A **trade** is one owner's open-market lines at one issuer on one date with one code (P or S), non-derivative,
  not superseded by a later 4/A. Lines split across fill prices are one trade at the share-weighted price.
- **Base price** is the price as filed on the Form 4 (weighted). When the filing reports no price, the close on the
  trade date is used and the methodology says so.
- **Return at horizon h** (1m = 30, 3m = 91, 6m = 182 calendar days) = first daily close on or after
  trade date + h, divided by the base price, minus 1. A horizon still in the future is "pending", never guessed.
- **Hit**: a buy is a hit when the return is above 0; a sale when it is below 0 (the stock fell after they sold).
- **Hit rate** at a horizon = hits / trades whose horizon has passed, over the insider's history at that company
  (the card) or at all companies (the person page). Fewer than 3 matured trades: shown, labelled "too few to judge".
- Prices are split-adjusted daily closes from the configured market data provider (Yahoo Finance chart data),
  stored once and reused; Form 4 prices are as filed, so a split between the trade and the horizon is corrected by
  using the provider's adjusted close on the trade date in place of the filed price when they differ by more than
  a split-sized ratio (≥ 1.8× or ≤ 0.55×). Every trade row carries its Form 4 link as Evidence; the methodology field
  names the price source.

Schema (`sql/024_track_record.sql`):
```sql
price_daily(ticker, day, close, PRIMARY KEY(ticker, day))                 -- daily closes, one provider
price_series(ticker PK, provider, first_day, last_day, fetched_at, status, error)
insider_trade_outcomes(owner_key, issuer_key, trade_date, code, PRIMARY KEY(...),
  ticker, owner_name, shares, base_price, base_source, value, accession, source_url, filed_on,
  ret_1m, ret_3m, ret_6m, computed_at)                                     -- one row per trade
insider_track_records(owner_key, issuer_key, PRIMARY KEY(...), ticker,
  buys JSONB, sells JSONB, computed_at)                                    -- the hit rates per pair
```
`owner_key`/`issuer_key` are CIKs without leading zeros (the engine stores both forms).

Worker: every 30 minutes, pairs with a new or changed P/S line (or a record older than a day) are recomputed, at
most 200 pairs and 40 price downloads a run. API: `GET /v1/people/<cik>/track-record`; every route that returns
transaction rows adds `track_record` (the card line) from one batched lookup.

## 2. Signal score (0–100, Low / Medium / High) on every trade

Weights (sum to 100 before penalties), each a pure function with a test:

| Factor | Points |
| --- | --- |
| Open-market buy (P) vs sale (S) | buy 30, sale 5 |
| Size vs holdings: shares / (shares_after − shares) for buys | up to 20 (≥ 50% of holdings = 20) |
| Cluster: 2+ insiders buying at the issuer within 10 days | 15, 3+ = 20 |
| First buy by this insider in 12+ months | 10 |
| Bought after a 20%+ drop (trade-date close vs 60-day high) | 10 |
| Track record (feature 1): 3m buy hit rate ≥ 60% on ≥ 3 trades | up to 10 |

Routine noise is pushed down, never hidden: awards (A), gifts (G), tax withholding (F), option exercises (M, X, C)
score ≤ 10 and are labelled; sales under a 10b5-1 plan are labelled "pre-scheduled" and capped at 15. Bands:
0–39 Low, 40–69 Medium, 70–100 High. Each score has one plain-English sentence built from its top factors
("High: the CFO and two directors all bought within a week, the first insider buys in 2 years.").

Schema (`sql/025_signal_score.sql`): `trade_scores(owner_key, issuer_key, trade_date, code PK, score SMALLINT,
band TEXT, factors JSONB, sentence TEXT, version SMALLINT, computed_at)`; computed by the same worker after the
track record, recomputed when a cluster partner files.

## 3. "Is my company's boss selling?" lookup

One search box (company name or ticker; reuses `src/search.mjs` and `sec_entities`) at `/boss-check`. Returns the
last 12 months of insider buys and sells in plain English ("Jane Doe, CFO, sold $2.1M on March 3, under a plan set
up in advance."). Free: the most recent 3 trades; the full history and alerts are Pro. No schema change; a new
public route with its own rate limit, classified "open" in `paywall.mjs` with the response trimmed for non-members.

## 4. Faster, smarter alerts

- Push and email within minutes of a new Form 4 for a watchlist company or followed person. Today: the 3-minute
  push tick and the immediate email tick; the change is matching on `trade_scores.band` instead of event type.
- Default threshold Medium or higher: `watchlist.min_band` and `followed_people.min_band` (`'low'|'medium'|'high'`,
  default `'medium'`), migration `sql/026_alert_thresholds.sql`. Existing `alert_mode` stays.
- Each alert: one sentence + score + filing link.
- Watchlist import: paste tickers or upload a CSV (`POST /v1/me/watchlist/import`, parsed server-side, capped,
  each ticker validated against the SEC ticker file; returns added / already there / unknown).

## 5. Free public pages

- `insidir.com/[ticker]` and `insidir.com/buys` (this week's biggest insider buys), server-rendered by
  `src/public-pages.mjs` (indexable, no login, cached, small enough for a phone on 3G).
- Latest trades with the signal label; the track record and the score sentence blurred behind "Start for $1".
- Share card per trade, 1080×1350 PNG: black background, JetBrains Mono, small "insidir." wordmark at the bottom,
  rendered with `sharp` from SVG (`scripts/build-share-cards.mjs` already does this for stories). Route
  `/share/trade/<id>.png`, cached on disk.

No schema change beyond 1–4.

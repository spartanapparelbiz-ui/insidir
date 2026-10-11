# Insidir financial intelligence engine

This document covers the backend engine. The website in `web/` is described in [WEBSITE.md](WEBSITE.md); the engine serves it on every non-API path.

## Implemented
- SEC current-filings Atom feed ingestion with declared User-Agent, rate control, bounded fetches, retry/backoff, and safe SEC URL allowlisting.
- EDGAR accession directory and Form 4 ownership XML parsing. **P/A non-derivative purchases** and **S/D sales** are distinguished from awards, exercises, derivative trades and other events.
- PostgreSQL persistence, accession deduplication, transactional writes, ingestion audit records, and a Postgres advisory lock to prevent overlapping workers.
- Public API for recent filings, complete filing transactions, issuers, insiders, transaction filters, and descriptive distinct-owner purchase grouping.
- Email/password sessions (salted scrypt), watchlists, on-demand activity alerts, account deletion. **Signup is disabled by default.**
- Explicit source registry; House/Senate, social, crypto ingestion are blocked pending licensing/legal review.
- Optional 15-minute automatic poller or secured on-demand/cron ingestion.

## Setup
1. Provision PostgreSQL and provide DATABASE_URL.
2. Set SEC_USER_AGENT to a **real organization name and monitored contact email**; do not use the example address.
3. Set ALLOWED_ORIGINS to the HTTPS origins of the Insidir website. Keep COOKIE_SECURE=1 in production.
4. Run npm install, npm run migrate, npm test.
5. Run npm start. AUTO_INGEST=1 enables 15-minute ingestion inside a single always-on service; alternatively use an external scheduled task with INGEST_SECRET and POST /v1/internal/ingest.
6. Leave ALLOW_SIGNUP=0 until the website's account, cancellation, privacy, and deletion flows are finished.

Run npm run ingest for a manual ingestion. This fetches up to 35 current filings by default; it is not a complete history backfill. Already parsed accessions are skipped.

## API (JSON)
- GET /v1 – service information
- GET /healthz – database and SEC configuration check
- GET /v1/status – latest ingestion and filing count
- GET /v1/sources – source availability and permissions
- GET /v1/filings?limit=30&q=&ticker= – recent official filing metadata
- GET /v1/filings/{18-digit accession} – original record with parsed transaction rows
- GET /v1/transactions?ticker=&category=reported_purchase
- GET /v1/companies?q= ; GET /v1/insiders?q=
- GET /v1/clusters?days=7&minOwners=2 – descriptive, not predictive; amendments can duplicate event counts

## Account API
Mutations require a trusted Origin header. Registration requires ALLOW_SIGNUP=1.
- POST /v1/auth/register, POST /v1/auth/login, POST /v1/auth/logout
- GET /v1/me, DELETE /v1/me
- GET /v1/me/watchlist, POST /v1/me/watchlist with JSON {"ticker":"AAPL"}, DELETE /v1/me/watchlist/AAPL
- GET /v1/me/alerts – computed on demand; email/push delivery is **not** implemented

Session tokens are random; their SHA-256 digests live in PostgreSQL. Cookies use HttpOnly/Secure/SameSite=Lax. Before making public registrations available add distributed rate-limiting, email verification, final privacy/retention policies and a working account-deletion UI.

## Compliance gates
- SEC fair-access guideline: declare user agent; keep requests below its limit; use caching; identify original filing and distinction between trade and publication dates.
- Do **not** scrape, commercialize, or republish congressional personal financial disclosures until counsel confirms use rights and data permissions. This code does not fetch them.
- Do not scrape Truth Social, X, or other social services without licensed/authorized access.
- Do not associate anonymous crypto wallets with politicians without strong verifiable evidence.
- Paid investment advice, personalized signals and compensation for securities analysis can implicate securities regulations; get relevant review before enabling.

## Deployment
Deploy this repository as **insidir-engine** on Railway, connected to Railway PostgreSQL. Set DATABASE_URL to a Railway PostgreSQL reference variable and provide the SEC operator identity. The same service serves the website from `web/` (the API lives under `/v1`), so sign-in cookies and API calls stay same-origin. The pages call the API with relative `/v1/...` paths, so if `web/` is hosted elsewhere, put it behind a reverse proxy that forwards `/v1` to this engine on the same domain.

## Honest limitations
- Tests use synthetic fixtures, not claims about current transactions.
- Live SEC fetching, data completeness, and outage recovery need verification in production.
- Issuer search only covers imported data.
- Grouping may double count amended filings. It is not an investment forecast.
- No Stripe payments, paid entitlements, authorized political feed, crypto watcher, social scan, or push notifications have been activated.

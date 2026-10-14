# Insidir financial intelligence engine

This document covers the backend engine. The website in `web/` is described in [WEBSITE.md](WEBSITE.md); the engine serves it on every non-API path.

## Implemented
- SEC current-filings Atom feed ingestion with declared User-Agent, rate control, bounded fetches, retry/backoff, and safe SEC URL allowlisting.
- EDGAR accession directory and Form 4 ownership XML parsing. **P/A non-derivative purchases** and **S/D sales** are distinguished from awards, exercises, derivative trades and other events.
- PostgreSQL persistence, accession deduplication, transactional writes, ingestion audit records, and a Postgres advisory lock to prevent overlapping workers.
- Public API for recent filings, complete filing transactions, issuers, insiders, transaction filters, and descriptive distinct-owner purchase grouping.
- Read-only SEC intelligence: official company ticker-to-CIK lookup, filings by company via Submissions API, and financial measures from XBRL Company Facts API. Each observation links to the originating document; no predictive advice is computed.
- Email/password sessions (salted scrypt), watchlists, on-demand activity alerts, account deletion. **Signup is disabled by default.**
- Optional read-only SnapTrade OAuth (scope exactly `read`) with PKCE S256, random user-bound and expiring state, encrypted tokens, rotated refresh tokens, on-demand brokerage positions, user-initiated revocation and privacy-preserving instrument normalization. Requires an approved SnapTrade OAuth app.
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

## Source-backed research and review journal
The `/research.html?ticker=AAPL` page organizes imported SEC Form 4 activity and its original filing references. Each transaction distinguishes the underlying transaction date from the filing's publication date, including transaction codes, derivative classification and amendments. Empty datasets are shown as unavailable rather than replaced with sample signals.

Signed-in users may save a private research status (`researching`, `watching`, `passed`) and up to 1500 characters of notes. Run `npm run migrate` on deployment to create `research_decisions` from `sql/003_research_decisions.sql`. The data is tied to the authenticated user and is deleted with the user account. Requests are same-origin only for writes.

The public-company intelligence brief uses `GET /v1/intelligence?ticker=AAPL`, returning selected 8-K, 10-K, 10-Q, proxy and beneficial-ownership disclosures, four reported XBRL measures (when available), and a chronological evidence brief combining SEC filings with already imported Form 4 transactions. Ticker mapping uses the SEC official `company_tickers.json`, not fuzzy company-name matching. The shared SEC client uses host/path allowlists, the configured real operator User-Agent, throttling, bounded responses, retry handling and 15-minute memory caching (ticker mapping for 24 hours). No scraped document text or AI-generated interpretation is presented. API responses explicitly report missing facts and coverage caveats.

There is **no brokerage integration, trade execution, trade recommendation engine, live quote feed or automatic strategy** in this release. Reviews are user-authored notes; they never place orders. Future brokerage workflows require a trading-capable partner, explicit consent, guardrails and financial-regulatory review.

## Free manual portfolio (no brokerage or vendor account)
Manually entered stock tickers and share counts work with existing user accounts and PostgreSQL. No paid market-data API or brokerage permissions are needed. The portfolio page shows these entries **above** the optional SnapTrade section. Each ticker links to its SEC Research Desk, and the page displays the most recent imported ownership transaction in the past 30 days when available. This is a ticker-only matching aid, not proof of security identity or a recommendation.

Run `npm run migrate` (server startup migrates automatically) to create `manual_holdings` from `sql/005_manual_holdings.sql`. API: `GET /v1/me/manual-holdings`; `POST /v1/me/manual-holdings` JSON `{"ticker":"AAPL","quantity":"2.5"}` to create/update; `DELETE /v1/me/manual-holdings/AAPL` to remove. All endpoints require a signed-in session; writes require the existing same-origin CSRF check. Holdings are private and automatically deleted with the user account. A user can store up to 100 entries with 8 decimal places of share precision. No prices or portfolio values are estimated. **Leave BROKERAGE_CONNECT_ENABLED=0** until a paid vendor connection is desired and configured.

## Read-only brokerage connections (optional)
This feature is OFF by default (`BROKERAGE_CONNECT_ENABLED=0`). It relies on SnapTrade **OAuth Apps** and a user's pre-existing **SnapTrade Personal** connections, not Commercial user-secret registration or direct Fidelity credentials. Create a Test app in the SnapTrade Dashboard, register the exact callback URI `https://YOUR_DOMAIN/v1/me/brokerage/callback`, and obtain a client ID and client secret. Test OAuth apps are limited to five users; production usage requires approval. Set `SNAPTRADE_OAUTH_CLIENT_ID`, `SNAPTRADE_OAUTH_CLIENT_SECRET`, `SNAPTRADE_OAUTH_REDIRECT_URI`, and an independently generated 32-byte hexadecimal `BROKERAGE_ENCRYPTION_KEY`; then set `BROKERAGE_CONNECT_ENABLED=1`.

**Do not set the encryption key in a public repository.** Save it in hosting secrets, back it up securely, and do not rotate it until existing encrypted tokens can be migrated. Never use the example placeholder callback in production. Sign-in accounts must be enabled and the main server (`npm start`) must run with PostgreSQL. Migrations now include `sql/004_brokerage_oauth.sql`. `npm run web` only shows the disconnected preview.

Connection steps: signed-in user chooses Connect on `portfolio.html` → POST `/v1/me/brokerage/connect` generates a one-time PKCE and state → user consents to `read` access in SnapTrade Personal → SnapTrade redirects to `/v1/me/brokerage/callback` → server validates and consumes state, exchanges the code, verifies the granted scope, and encrypts access and refresh tokens in PostgreSQL. User shares only the accounts they authorized with SnapTrade. GET `/v1/me/brokerage/portfolio` reads investments and positions on demand without storing the account snapshot, excludes non-stock holdings from SEC ticker-based matching, and displays source-backed imported Form 4 disclosures from the last 30 days when available. Ticker matching is only a lead for manual investigation; it cannot establish security identity on its own. SnapTrade positions and quotes may be delayed and records may be incomplete.

DELETE `/v1/me/brokerage` calls the OAuth revocation endpoint before erasing stored credentials. Local account deletion also attempts to revoke active access first; if the provider cannot confirm revocation, the request fails rather than silently abandoning the grant. Users can independently revoke Insidir's access in SnapTrade Personal → Settings → Connected apps.

OAuth is strictly read-only: the authorization URL requests only `read`; the database accepts only `read`; no trading endpoints are available or called. This phase is **not** a regulated portfolio manager or execution feature. It does not provide individual trade recommendations. Get legal/compliance review and broker permissions before adding personalized advice or orders. Confirm the provider's terms, privacy and cybersecurity requirements before production. Before broad launch, add independent penetration/security review, durable audit logs, account consent tracking and integration monitoring.

API endpoints (authenticated): GET `/v1/me/brokerage/status`; POST `/v1/me/brokerage/connect`; GET `/v1/me/brokerage/callback`; GET `/v1/me/brokerage/portfolio`; DELETE `/v1/me/brokerage`. Mutations require a trusted same-origin request. No provider credentials or OAuth tokens are returned to the browser.

## API (JSON)
- GET /v1 – service information
- GET /healthz – database and SEC configuration check
- GET /v1/status – latest ingestion and filing count
- GET /v1/sources – source availability and permissions
- GET /v1/filings?limit=30&q=&ticker= – recent official filing metadata
- GET /v1/filings/{18-digit accession} – original record with parsed transaction rows
- GET /v1/transactions?ticker=&category=reported_purchase
- GET /v1/companies?q= ; GET /v1/insiders?q=
- GET /v1/intelligence?ticker=AAPL – selected company SEC filings, XBRL facts, original-source links, and deterministic research brief (SEC_USER_AGENT required)
- GET /v1/clusters?days=7&minOwners=2 – descriptive, not predictive; amendments can duplicate event counts
- GET /v1/search?q=nvidia – ticker and company-name lookup over the SEC's official ticker mapping (one listing per issuer for name matches; every share class for ticker matches)
- GET /v1/market/chart?ticker=NVDA&range=1Y – delayed price series (1D, 1W, 1M, 3M, 1Y, 5Y) plus the session quote (price, previous close, daily change). `MARKET_DATA_PROVIDER=none` turns market data off
- GET /v1/company/profile?ticker=NVDA – Wikidata facts matched exactly by SEC CIK (P5531): founding year, latest employee count, official website, logo, leadership and founders with Commons photos, plus the Wikipedia summary
- GET /v1/company/insiders?ticker=NVDA – the issuer's 16 most recent Form 4/4A filings parsed live from EDGAR: owner, role, transaction codes, net open-market shares, reported value and holdings after
- GET /v1/company/news?ticker=NVDA – 8-K announcements with item descriptions, and publisher headlines that name the company
- GET /v1/company/logo?ticker=NVDA – 302 to the company's prepared logo (`/v1/media/<sha256>.png`), or 404 when no published logo can be verified. `variant=wide` prefers a wordmark. `X-Logo-Source` names the source
- GET /v1/company/photos?ticker=NVDA&wait=2500 – verified portraits for the company's SEC reporting people (keyed `cik:<owner CIK>`), display names, and current leadership/founders from Wikidata. Work runs in the background; `complete:false` means more sources are still being checked (`wait` holds up to 8 s)
- GET /v1/media/<sha256>.(png|webp|jpeg) – prepared logos and portraits, content-addressed and immutable

`/v1/intelligence` additionally returns `ttm` (trailing twelve months: latest fiscal year + current year-to-date − prior-year year-to-date), `balance` (cash and short-term investments and total debt from one balance-sheet date), `shares` (newest reported shares outstanding), `profile` (exchange, business address, fiscal year end, industry) and `currency`. US GAAP and IFRS (20-F/40-F) taxonomies are supported. The company endpoints need no database; `npm run web` serves them for previews.

### Company report data sources
- **SEC EDGAR / XBRL** (with `SEC_USER_AGENT`): ticker map, submissions, company facts and Form 4 XML. Requests share one throttle (8 per second, below the SEC's 10-per-second limit); filed ownership documents are cached for 24 hours and summaries for 15 minutes.
- **Yahoo Finance public chart and news endpoints**: delayed prices and headlines, cached 1–60 minutes by range. These endpoints are unofficial; review Yahoo's terms and switch to a licensed market-data vendor before relying on them commercially. Set `MARKET_DATA_PROVIDER=none` to hide prices.
- **Wikidata (CC0) and Wikipedia (CC BY-SA 4.0)**: profile facts, leadership and descriptions. The page attributes Wikipedia text and links to the source. Profiles are cached for 24 hours.

### Logos (`src/logo-resolver.mjs`)
Every SEC-listed company gets its real logo shown on the page background with no tile or box, or no logo at all. Candidates come from stock-logo libraries (stockanalysis light/dark, companiesmarketcap), the company's Wikipedia infobox and Wikidata logo (matched by CIK), then the company's own website (JSON-LD, header logo, touch icon; domain verified from SEC filings) and FMP, EODHD and nvstly. Those three key images by ticker alone, so their logo is shown only when another source shows the same mark. `LOGO_OVERRIDES` in the resolver holds corrections found by auditing a 120-company sample (the company's own file, or no logo when every source shows another company); operator overrides in the store take precedence. A candidate is used only when the identity is safe: recycled tickers and recent rebrands (SEC former names, new 8-A12B/424B4 filers) need shape agreement (IoU ≥ 0.5 on 48×48 ink masks) between independent sources. The chosen file is prepared server-side with sharp (`src/image-analysis.mjs`): a uniform tile around the mark is keyed out, ink that would vanish on the dark page is lifted (near-black becomes off-white, dark brand colours keep their hue), and the result is trimmed. Logos that are a badge by design stay as drawn. Results are cached 30 days (1 day when a better source was unreachable, 7 days for "no logo").

### People photos (`src/people-photos.mjs`)
Each person shown on the report gets a real photo or keeps initials; faces are never generated or guessed. Sources, strongest first:
1. Wikidata/Commons people linked to the company or its notable subsidiaries by statements (CEO, chair, board, officer, founder, employer, position held), EntitySearch with a statement tie, and Wikipedia search whose article links to the company. Only free-licence files, credited.
2. The company's own leadership and board pages (domain verified from SEC filings; robots.txt and crawl-delay respected; bot walls end the crawl).
3. Headshots printed in the company's latest SEC proxy statement (DEF 14A), paired by alt text and caption layout.
4. The same person's captioned headshot in another company's proxy where they also file as an insider (tied by SEC owner CIK).
Commons answers first; when the company's page or proxy also has the person, that official headshot replaces the Commons picture. Every match uses one strict name matcher (`src/person-match.mjs`: surname plus given name, nickname or 3+ letter prefix, no conflicting middle initial) and must be tied to the company; a name alone never attaches a photo. A verified photo is reused wherever the same owner CIK files. Portraits are cropped to 256 px WebP. Company results are cached 7 days, person photos 90 days.

### Media store
Prepared images live in `entity_media` (sha256, bytes) and decisions in `media_records` (`sql/007_entity_media.sql`), with a bounded in-memory cache in front, so restarts and extra instances do not refetch third-party sources. Without `DATABASE_URL` everything works from memory. Third-party image fetches are https-only, public-address-only (re-checked on each redirect), size-limited and byte-sniffed; SVGs with scripts or external references are rejected. Image responses carry a sandbox CSP.

## Account API
Mutations require a trusted Origin header. Registration requires ALLOW_SIGNUP=1.
- POST /v1/auth/register, POST /v1/auth/login, POST /v1/auth/logout
- GET /v1/me, DELETE /v1/me
- GET /v1/me/watchlist, POST /v1/me/watchlist with JSON {"ticker":"AAPL"}, DELETE /v1/me/watchlist/AAPL
- GET /v1/me/research-decisions?ticker=AAPL; POST /v1/me/research-decisions with JSON {"ticker":"AAPL","reviewStatus":"watching","notes":"Read the original filing"}; DELETE /v1/me/research-decisions?ticker=AAPL
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
- The original issuer search and Form 4 database cover imported data only; the intelligence ticker lookup covers the current official SEC mapping, which the SEC says may be incomplete.
- SEC company facts and company submissions may be temporarily unavailable, outdated, or lack a particular ticker or metric; the interface states the limitation rather than inventing results.
- Grouping may double count amended filings. It is not an investment forecast.
- No personalized trading advice, autonomous strategies, licensed political feed, crypto watcher, social scan, or push notifications have been activated. Read-only brokerage access requires configuration and real integration tests; it is not live by default.

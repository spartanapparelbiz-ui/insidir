# Insidir financial intelligence engine

This document covers the backend engine. The website in `web/` is described in [WEBSITE.md](WEBSITE.md); the engine serves it on every non-API path.

## Implemented
- SEC current-filings Atom feed ingestion with declared User-Agent, rate control, bounded fetches, retry/backoff, and safe SEC URL allowlisting.
- EDGAR accession directory and Form 4 ownership XML parsing. **P/A non-derivative purchases** and **S/D sales** are distinguished from awards, exercises, derivative trades and other events.
- PostgreSQL persistence, accession deduplication, transactional writes, ingestion audit records, and a Postgres advisory lock to prevent overlapping workers.
- Subscriber API for recent filings, complete filing transactions, issuers, insiders, transaction filters, and descriptive distinct-owner purchase grouping.
- Read-only SEC intelligence: official company ticker-to-CIK lookup, filings by company via Submissions API, and financial measures from XBRL Company Facts API. Each observation links to the originating document; no predictive advice is computed.
- **Hard paywall** (`src/paywall.mjs`): no free tier and no free trial. Every product page and every product API needs a signed-in account with an active Insidir Pro subscription ($39/month through Stripe) or a complimentary owner/team email. See [Hard paywall and billing](#hard-paywall-and-billing).
- Email/password sessions (salted scrypt), watchlists, on-demand activity alerts, and account deletion that cancels the Stripe subscription first. **Signup is disabled by default.**
- Optional read-only SnapTrade OAuth (scope exactly `read`) with PKCE S256, random user-bound and expiring state, encrypted tokens, rotated refresh tokens, on-demand brokerage positions, user-initiated revocation and privacy-preserving instrument normalization. Requires an approved SnapTrade OAuth app.
- Explicit source registry; House/Senate, social, crypto ingestion are blocked pending licensing/legal review.
- Optional 15-minute automatic poller or secured on-demand/cron ingestion.

## Setup
1. Provision PostgreSQL and provide DATABASE_URL.
2. Set SEC_USER_AGENT to a **real organization name and monitored contact email**; do not use the example address.
3. Set ALLOWED_ORIGINS to the HTTPS origins of the Insidir website. Keep COOKIE_SECURE=1 in production.
4. Run npm install, npm run migrate, npm test.
5. Run npm start. AUTO_INGEST=1 enables 15-minute ingestion inside a single always-on service; alternatively use an external scheduled task with INGEST_SECRET and POST /v1/internal/ingest.
6. Configure the paywall and Stripe billing (next section). The paywall is on by default: until billing is configured, nobody except the accounts in `INSIDIR_COMPLIMENTARY_EMAILS` can use the product.
7. Set ALLOW_SIGNUP=1 once billing works end to end; people create an account first and subscribe on `/subscribe.html`.

Run npm run ingest for a manual ingestion. This fetches up to 35 current filings by default; it is not a complete history backfill. Already parsed accessions are skipped.

## Source-backed research and review journal
The `/research.html?ticker=AAPL` page organizes imported SEC Form 4 activity and its original filing references. Each transaction distinguishes the underlying transaction date from the filing's publication date, including transaction codes, derivative classification and amendments. Empty datasets are shown as unavailable rather than replaced with sample signals.

Signed-in users may save a private research status (`researching`, `watching`, `passed`) and up to 1500 characters of notes. Run `npm run migrate` on deployment to create `research_decisions` from `sql/003_research_decisions.sql`. The data is tied to the authenticated user and is deleted with the user account. Requests are same-origin only for writes.

The public-company intelligence brief uses `GET /v1/intelligence?ticker=AAPL`, returning selected 8-K, 10-K, 10-Q, proxy and beneficial-ownership disclosures, four reported XBRL measures (when available), and a chronological evidence brief combining SEC filings with already imported Form 4 transactions. Ticker mapping uses the SEC official `company_tickers.json`, not fuzzy company-name matching. The shared SEC client uses host/path allowlists, the configured real operator User-Agent, throttling, bounded responses, retry handling and 15-minute memory caching (ticker mapping for 24 hours). No scraped document text or AI-generated interpretation is presented. API responses explicitly report missing facts and coverage caveats.

There is **no brokerage integration, trade execution, trade recommendation engine, live quote feed or automatic strategy** in this release. Reviews are user-authored notes; they never place orders. Future brokerage workflows require a trading-capable partner, explicit consent, guardrails and financial-regulatory review.

## Hard paywall and billing
Insidir is a paid product with **no free tier and no free trial**. `src/paywall.mjs` holds the rules as pure functions (`classifyPage`, `classifyApi`, `hasAccess`, `accessSummary`, `safeNext`, `gate`); `src/api.mjs` runs `gate()` on every request, before it serves a page, a company report endpoint, billing or any other API. `test/paywall.test.mjs` covers the rules end to end without a database.

**Access** means the account's `users.subscription_status` is `active` or `trialing`, **or** its email is listed in `INSIDIR_COMPLIMENTARY_EMAILS` (comma-separated, case and spaces ignored; for the owner and team). `past_due`, `unpaid`, `incomplete`, `paused`, `canceled` and no subscription do not have access. **With the paywall on and billing not configured, nobody but complimentary accounts can use the product, and nobody can subscribe.**

| Requests | Signed out | Signed in, no access | Access |
| --- | --- | --- | --- |
| Product pages: `dashboard`, `research`, `explore`, `company`, `filings`, `filing`, `people`, `watchlist`, `portfolio`, `alerts` (GET/HEAD, with or without `.html`, any query) | 302 → `/signin.html?next=<path+query>` | 302 → `/subscribe.html?next=<path+query>` | served |
| Account pages: `subscribe`, `billing`, `account` | 302 → `/signin.html?next=…` | served | served |
| Public pages (`index`, `platform`, `why-insidir`, `data`, `pricing`, `company-info`, `terms`, `privacy`, `signin`, `signup`, `404`, `account-deleted`) and every asset | served | served | served |
| Product API: `/v1/filings*`, `/v1/transactions`, `/v1/companies`, `/v1/clusters`, `/v1/insiders`, `/v1/status`, `/v1/search`, `/v1/intelligence`, `/v1/market/chart`, `/v1/company/*`, `/v1/me/watchlist*`, `/v1/me/research-decisions*`, `/v1/me/manual-holdings*`, `/v1/me/people*`, `/v1/me/alerts`, `/v1/me/brokerage/*` (except the deletes in the next row) | 401 `{error, signin:"/signin.html"}` | 402 `{error:"An active Insidir subscription is required", subscribe:"/subscribe.html"}` | handled |
| Deleting your own data: `DELETE /v1/me/brokerage` (revokes the read grant), `DELETE /v1/me/watchlist/{ticker}`, `DELETE /v1/me/people/{cik}`, `DELETE /v1/me/manual-holdings/{ticker}`, `DELETE /v1/me/research-decisions?ticker=` | 401 `{error, signin:"/signin.html"}` | handled | handled |
| Open API: `/v1`, `/v1/sources`, `/healthz`, `/v1/auth/*`, `GET`/`DELETE /v1/me`, `/v1/billing/*`, `/v1/internal/ingest` (its own bearer secret) | handled | handled | handled |

- Removing your own data never needs a subscription: a member whose subscription has lapsed can still revoke a brokerage grant and delete saved items one by one (reading or adding them still needs access). This is the one deliberate exception to "`/v1/me/*` is product data".
- Redirects carry `Cache-Control: no-store`. Everything served past the gate to a signed-in visitor (product data, product and account pages) is rewritten to `Cache-Control: private, …` (or stays `no-store`) with `Vary: Cookie`, so a CDN or shared cache placed in front of the engine can never replay one member's response to a visitor the gate would stop. Public pages and assets keep their normal caching; `npm run web` is not gated and keeps `public`.
- If the session cannot be checked (for example the database is unreachable) gated requests stay closed: product and account page navigations get a readable 503 HTML page ("Back in a moment", a *Try again* link to the same page, `no-store`, `Retry-After: 30`) and gated API calls get 503 JSON. Public pages and assets still work because they never touch the session. Page paths are matched the way the static server resolves them (percent-decoding, dot segments, trailing slashes, any letter case), so an encoded path cannot reach a product page. Any `/v1` route that is not listed as open is treated as product data (fail closed).
- The brokerage OAuth callback (`/v1/me/brokerage/callback`) is a browser navigation, so it redirects like a page (`next=/portfolio.html`) instead of answering 401/402.
- `next=` values are only ever same-origin relative paths to known product or account pages, optionally with a query (`/company.html?ticker=AAPL`); absolute and protocol-relative URLs, backslashes, fragments, dot segments, encoded paths and unknown pages are rejected (`safeNext`). Pages must validate `next` the same way before navigating.
- One database query per request: `currentUser()` returns the subscription fields with the session and is memoised for the request, so the gate and the handler share it. Public pages and assets never touch the session.
- `INSIDIR_PAYWALL=0` turns gating off (local development only; the engine logs a warning at startup). Any other value, including unset, keeps it on. `npm run web` (no database) stays ungated for design previews.

`GET /v1/me` (never gated) returns:

```json
{"user":{"id":"…","email":"…"},
 "access":{"active":true,"plan":"pro","status":"active","billingEnabled":true,"complimentary":false,"currentPeriodEnd":"2026-11-14T00:00:00.000Z"}}
```

`active` is whether the account can use the product right now (always true when `INSIDIR_PAYWALL=0`); `plan` is `pro` only for a Stripe subscription in good standing (`none` otherwise, including complimentary accounts); `status` is the raw Stripe status or null. `POST /v1/auth/login` and `POST /v1/auth/register` return the same `access` object next to `user`, so the sign-in page can choose between the product and `/subscribe.html` without another request.

### Billing endpoints (signed in; no subscription needed)
- `GET /v1/billing/status` → `{billingEnabled, plan:"pro"|"none", active, complimentary, subscriptionStatus, currentPeriodEnd, hasCustomer}`. `?refresh=1` re-reads the customer's subscriptions from Stripe first (rate-limited); call it on `/billing.html?checkout=success` in case the webhook has not arrived yet.
- `POST /v1/billing/checkout` → `{url}` of a Stripe Checkout page for the configured Price. Success returns to `/billing.html?checkout=success`, cancel to `/subscribe.html?checkout=cancel`. No trial is configured. Requests must come from `INSIDIR_PUBLIC_URL`'s origin. To prevent double billing:
  - For an account that already has a Stripe customer, the engine **re-reads the customer's subscriptions from Stripe first** (and stores the result), so a checkout that completed before its webhook arrived counts. It refuses with 409 while any subscription for the configured Price can still bill: `active`/`trialing` (manage it instead), `past_due`/`unpaid` (update the payment method in the portal), `incomplete` (first payment still being confirmed) or `paused`. If Stripe cannot be read, it answers 503 and starts nothing. A customer that no longer exists in this Stripe account (e.g. test data after switching to live keys) is replaced by a new one.
  - Any earlier **open** Checkout page of the customer is expired before a new one is created, so only the newest can be paid.
  - One billing change per account at a time: a second checkout (or an account deletion) while one is being prepared answers 409.
- `POST /v1/billing/portal` → `{url}` of the Stripe customer portal (cancel, update card, invoices); returns to `/billing.html`.
- `POST /v1/billing/webhook` — Stripe events, verified with the signing secret (5-minute tolerance, rolled secrets accepted) and processed once per event ID. For each event the engine **re-reads the customer's subscriptions from Stripe** and stores the one in the best standing, so late or out-of-order events cannot lock out a paying member or keep a cancelled one in. Only subscriptions to the exact `INSIDIR_STRIPE_PRICE_ID` grant access; others are stored as `inactive`. A failed update forgets the event so Stripe's retry is processed.

### Account deletion
`DELETE /v1/me` makes sure nothing in Stripe can bill the account again **before** anything is deleted. It does not rely on the subscription ID saved by the webhook, which can be missing or stale (webhook not yet delivered or misconfigured, or more than one subscription on the customer):
1. If the account has a Stripe customer, every **open Checkout page** of that customer is expired (`POST /v1/checkout/sessions/{id}/expire`), so a payment completed later cannot start a subscription for a deleted account.
2. The engine asks Stripe for **all of the customer's subscriptions** (`GET /v1/subscriptions?customer=…&status=all`, every page) and cancels every one that can still bill (any status except `canceled` and `incomplete_expired`: active, trialing, past_due, unpaid, incomplete, paused), **whatever its Price**, with `DELETE /v1/subscriptions/{id}`.
3. Fallback: the saved subscription ID is cancelled too if Stripe did not list it for the customer.

If Stripe cannot confirm any step (unreachable, not configured, an error, a list it cannot read in full), the account is **not** deleted and the endpoint returns 503 with a message the page shows; every cancellation Stripe did accept stays cancelled, and trying again finishes the job. A customer that does not exist in the configured Stripe account cannot bill from it, so that case does not block deletion. Then the engine revokes an active brokerage grant, deletes the user (sessions, watchlist, notes, holdings and follows cascade) and clears the cookie: `{deleted:true, subscriptionCanceled:boolean}`. Cancellation is immediate and Stripe issues no automatic partial refund. The Stripe customer record and its invoices stay in Stripe for accounting.

Safety net: if an Insidir checkout (its metadata names the Insidir account) still completes after that account was deleted, the `checkout.session.completed` webhook cancels the new subscription and logs a warning so the operator can refund the first invoice. Checkouts that Insidir did not create on the same Stripe account are never touched.

### Environment
| Variable | Default | Meaning |
| --- | --- | --- |
| `INSIDIR_PAYWALL` | on | `0` turns the paywall off (local development only). Anything else keeps it on. |
| `INSIDIR_COMPLIMENTARY_EMAILS` | empty | Comma-separated owner/team emails with access and no subscription. There is no email verification: register these accounts before listing them. |
| `INSIDIR_BILLING_ENABLED` | `0` | `1` enables checkout and the portal, together with the three Stripe values below. |
| `INSIDIR_STRIPE_SECRET_KEY` | empty | Stripe secret key. Also needed on account deletion: any account that ever started a checkout cannot be deleted while Stripe is unreachable or this key is missing, because nothing is deleted until Stripe confirms no subscription can bill. Keep it set while any customer exists. |
| `INSIDIR_STRIPE_PRICE_ID` | empty | The $39/month recurring Price. Only this exact Price grants access; if it is ever replaced, existing subscribers on the old Price lose access, so migrate them in Stripe first. |
| `INSIDIR_STRIPE_WEBHOOK_SECRET` | empty | Signing secret of the `https://YOUR_DOMAIN/v1/billing/webhook` endpoint. |
| `INSIDIR_PUBLIC_URL` | empty | Public HTTPS origin of the site, used for Checkout return URLs and the billing origin check. |

### Stripe setup
1. In Stripe create the product "Insidir Pro" with one recurring Price of $39.00 USD per month and no trial; copy its `price_…` ID.
2. Add a webhook endpoint `https://YOUR_DOMAIN/v1/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused` and `customer.subscription.resumed`; copy its signing secret.
3. Configure the customer portal (cancellation, payment method updates, invoice history).
4. Set the variables above, `INSIDIR_BILLING_ENABLED=1`, then `ALLOW_SIGNUP=1`. Test a full signup → checkout → dashboard → cancel → deletion cycle in Stripe test mode before switching to live keys.

## Manual portfolio (no brokerage or vendor account)
Manually entered stock tickers and share counts work with existing user accounts and PostgreSQL. No paid market-data API or brokerage permissions are needed. The portfolio page shows these entries **above** the optional SnapTrade section. Each ticker links to its SEC Research Desk, and the page displays the most recent imported ownership transaction in the past 30 days when available. This is a ticker-only matching aid, not proof of security identity or a recommendation.

Run `npm run migrate` (server startup migrates automatically) to create `manual_holdings` from `sql/005_manual_holdings.sql`. API: `GET /v1/me/manual-holdings`; `POST /v1/me/manual-holdings` JSON `{"ticker":"AAPL","quantity":"2.5"}` to create/update; `DELETE /v1/me/manual-holdings/AAPL` to remove. All endpoints require a signed-in session with an active subscription (except `DELETE`, which only needs a sign-in so a lapsed member can still remove entries); writes require the existing same-origin CSRF check. Holdings are private and automatically deleted with the user account. A user can store up to 100 entries with 8 decimal places of share precision. No prices or portfolio values are estimated. **Leave BROKERAGE_CONNECT_ENABLED=0** until a paid vendor connection is desired and configured.

## Read-only brokerage connections (optional)
This feature is OFF by default (`BROKERAGE_CONNECT_ENABLED=0`). It relies on SnapTrade **OAuth Apps** and a user's pre-existing **SnapTrade Personal** connections, not Commercial user-secret registration or direct Fidelity credentials. Create a Test app in the SnapTrade Dashboard, register the exact callback URI `https://YOUR_DOMAIN/v1/me/brokerage/callback`, and obtain a client ID and client secret. Test OAuth apps are limited to five users; production usage requires approval. Set `SNAPTRADE_OAUTH_CLIENT_ID`, `SNAPTRADE_OAUTH_CLIENT_SECRET`, `SNAPTRADE_OAUTH_REDIRECT_URI`, and an independently generated 32-byte hexadecimal `BROKERAGE_ENCRYPTION_KEY`; then set `BROKERAGE_CONNECT_ENABLED=1`.

**Do not set the encryption key in a public repository.** Save it in hosting secrets, back it up securely, and do not rotate it until existing encrypted tokens can be migrated. Never use the example placeholder callback in production. Sign-in accounts must be enabled and the main server (`npm start`) must run with PostgreSQL. Migrations now include `sql/004_brokerage_oauth.sql`. `npm run web` only shows the disconnected preview.

Connection steps: signed-in user chooses Connect on `portfolio.html` → POST `/v1/me/brokerage/connect` generates a one-time PKCE and state → user consents to `read` access in SnapTrade Personal → SnapTrade redirects to `/v1/me/brokerage/callback` → server validates and consumes state, exchanges the code, verifies the granted scope, and encrypts access and refresh tokens in PostgreSQL. User shares only the accounts they authorized with SnapTrade. GET `/v1/me/brokerage/portfolio` reads investments and positions on demand without storing the account snapshot, excludes non-stock holdings from SEC ticker-based matching, and displays source-backed imported Form 4 disclosures from the last 30 days when available. Ticker matching is only a lead for manual investigation; it cannot establish security identity on its own. SnapTrade positions and quotes may be delayed and records may be incomplete.

DELETE `/v1/me/brokerage` calls the OAuth revocation endpoint before erasing stored credentials. Local account deletion also attempts to revoke active access first; if the provider cannot confirm revocation, the request fails rather than silently abandoning the grant. Users can independently revoke Insidir's access in SnapTrade Personal → Settings → Connected apps.

OAuth is strictly read-only: the authorization URL requests only `read`; the database accepts only `read`; no trading endpoints are available or called. This phase is **not** a regulated portfolio manager or execution feature. It does not provide individual trade recommendations. Get legal/compliance review and broker permissions before adding personalized advice or orders. Confirm the provider's terms, privacy and cybersecurity requirements before production. Before broad launch, add independent penetration/security review, durable audit logs, account consent tracking and integration monitoring.

API endpoints (authenticated): GET `/v1/me/brokerage/status`; POST `/v1/me/brokerage/connect`; GET `/v1/me/brokerage/callback`; GET `/v1/me/brokerage/portfolio`; DELETE `/v1/me/brokerage`. Mutations require a trusted same-origin request. No provider credentials or OAuth tokens are returned to the browser.

## API (JSON)
Every endpoint below except `/v1`, `/healthz` and `/v1/sources` is product data: it answers 401 when signed out and 402 without an active subscription (see [Hard paywall and billing](#hard-paywall-and-billing)).
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
Mutations require a trusted Origin header. Registration requires ALLOW_SIGNUP=1. `/v1/auth/*`, `GET /v1/me`, `DELETE /v1/me` and `/v1/billing/*` work without a subscription; the `/v1/me/*` endpoints below need one (402 otherwise), except their `DELETE`s and `DELETE /v1/me/brokerage`, which any signed-in account may call to remove its own data.
- POST /v1/auth/register, POST /v1/auth/login (both return `{user, access}`), POST /v1/auth/logout
- GET /v1/me → `{user:{id,email}, access}`; DELETE /v1/me cancels the Stripe subscription first, then deletes the account
- GET /v1/me/watchlist, POST /v1/me/watchlist with JSON {"ticker":"AAPL"}, DELETE /v1/me/watchlist/AAPL
- GET /v1/me/people (followed reporting people), POST /v1/me/people with JSON {"owner_cik":"1214156"} (404 if the CIK is not in imported records, 409 beyond 150 follows, 429 when follow attempts are too frequent), DELETE /v1/me/people/1214156
- GET /v1/me/people/updates?limit=40 (1-100): `people` — each followed person (most recently active first) with `owner_name`, `ticker`, `issuer_name`, `last_published_at`, `last_transaction_date`, `last` (their newest transaction line), `filings_30d`, `transactions_30d`, `purchases_30d_value`, `sales_30d_value`; `items` — the newest transaction lines by anyone followed, newest publication first; `following` — the count
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
- The paywall trusts Stripe's subscription status as stored by the webhook (or `?refresh=1`, or a checkout attempt). If webhooks are not delivered and nobody refreshes, a cancellation reaches Insidir late; Stripe retries failed webhooks for three days. Account deletion and checkout do not depend on the stored status: they re-read Stripe.
- The one-billing-change-per-account lock is per process; Insidir runs as a single service. With several instances, the Stripe re-reads, the expiry of earlier open Checkout pages and the orphaned-checkout safety net still apply.
- Account deletion treats a customer that does not exist in the configured Stripe account as unable to bill. If the secret key belongs to a different Stripe account than the one that billed the customer, cancel that subscription in the right Stripe dashboard.
- There is no email verification, so a complimentary address must be registered by its owner before it is listed.
- No personalized trading advice, autonomous strategies, licensed political feed, crypto watcher, social scan, or push notifications have been activated. Read-only brokerage access requires configuration and real integration tests; it is not live by default.

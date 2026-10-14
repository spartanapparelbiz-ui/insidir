## Insidir V14: hard paywall, a page behind every button, sharp images (October 2026)

- **Hard paywall.** Insidir is a paid product: $39/month through Stripe, no free tier and no free trial. The engine gates every product page (dashboard, research desk, companies, company reports, filings, people, watchlist, portfolio, alerts) and every product API. Signed-out visitors are sent to sign in, signed-in accounts without an active subscription to `/subscribe.html`; product APIs answer 401 or 402. Sign-up continues straight to the subscription step, and deleting an account cancels the Stripe subscription first. See [ENGINE.md](docs/ENGINE.md) for the environment variables. **Until Stripe billing is configured, nobody except the accounts listed in `INSIDIR_COMPLIMENTARY_EMAILS` can use the product.**
- **A real page behind every button.** New public pages: Platform (`platform.html`), Why Insidir (`why-insidir.html`), Data and sources (`data.html`), plus Subscribe (`subscribe.html`) and Account deleted (`account-deleted.html`). No link anywhere points to an anchor on the landing page, and the tests fail on any link to a missing page.
- **Landing page without a dashboard.** The research-preview terminal and the live filings feed are gone; the landing page loads no product data and links nothing into paid pages. It tells the product story in type, works from 320px to 1920px and keeps the interactive halftone wordmark.
- **A dashboard that reads in order.** Search first, then your watchlist (with each ticker's latest imported insider transaction) and research notes, latest filings, insider activity with filters, disclosure activity, the data source, and reporting people. `scripts/dashboard-check.mjs` tests it in Chrome against mocked data: sections, filters, empty and error states, 401/402 redirects, every link and overflow at five widths.
- **Sharp images only.** The palette audit now fails any raster image whose native pixels are less than twice its rendered size. Decorative upscaled photos were removed from the dashboard, explore and 404 pages, and portraits use high-resolution Wikimedia Commons files checked by `scripts/verify-media.mjs`.
- **One typeface.** Every page, headline and the wordmark use JetBrains Mono; headlines are simply larger.

## Insidir V13 "Halftone" identity (October 2026)

- One visual system on every page — landing, sign-in and sign-up, the product dashboard and desk pages, company reports, pricing, legal and the not-found page: night paper `#0c0c0b`, warm off-white ink `#e9e4da` and a single warm orange `#e9762b` used only as a flat accent (the chart line, hover states, losses and sales); nothing glows. Every other colour is a blend of those three.
- Type: one typeface everywhere, self-hosted JetBrains Mono (SIL OFL): tracked uppercase micro-labels, navigation, buttons, table heads, captions and body copy, and the same face at 700–800 for headings, numbers and the `insidir` wordmark with its warm dot. Square corners, hairline rules, no shadows, print grain over everything, photographs in grayscale.
- The landing page opens on a halftone wordmark: `insidir` set enormous and cropped by the bottom of the first screen, printed as a field of dots sized by letter coverage. Dots part around the pointer on springs and stay ink; a click sends a ring through the word. It appears only there; every page ends with the same plain tracked footer.
- Implementation: `web/assets/css/v13-halftone.css` (shared theme in the `insidir-v13` cascade layer, so it re-skins the older stylesheets without editing them), one `v13-<family>.css` per page family, `web/assets/js/v13-halftone.js` (the halftone engine, plain JavaScript, no dependencies) and a new favicon. `node scripts/v13-palette-audit.mjs` renders every page in headless Chromium and fails on any colour outside the palette, low text contrast, serif text, overflow, browser errors, a missing footer or a dotted wordmark anywhere but the landing hero; CI runs it after the layout check.

## Insidir V12 company report (October 2026)

- `company.html?ticker=NVDA` is one market-terminal design for **every company in the SEC's official ticker list**: logo, name, exchange and description; a delayed price chart with 1D/1W/1M/3M/1Y/5Y ranges; key facts (market cap, enterprise value, P/E, TTM revenue and net income, employees, headquarters, founding year, website); and Overview, Financials, SEC filings, Insider activity, People and News tabs.
- Data is fetched live and cached server-side: delayed prices from Yahoo Finance's public chart endpoint, financial statements and filings from SEC EDGAR/XBRL, insider activity from each issuer's own recent Form 4 filings, company profile facts from Wikidata (matched by SEC CIK) and descriptions from Wikipedia (CC BY-SA, attributed). Every company's real logo is shown with no box (stock-logo libraries, Wikipedia/Wikidata and the company's site, identity-checked and prepared server-side), and every officer, director and founder gets a verified photo (Wikimedia Commons, the company's leadership pages or SEC proxy headshots, matched by name and tied to the company) or their initials — never a generated face. Market cap, enterprise value and P/E are calculated from those sources and show their inputs on hover. Missing values are shown as missing, never estimated.
- The shared product header now has the mockup navigation (Overview, Research, People, Companies, Filings, Watchlist, Alerts — Portfolio moved to the account menu), a ticker/company/people typeahead with ⌘K / Ctrl K, and the signed-in user's initial.
- `npm run web` serves the company report endpoints without a database, so the page can be previewed with real data when `SEC_USER_AGENT` is set.

## Insidir V3 (October 2026)

- Production landing page: centered market-research hero, working SEC filing preview, detailed company/fundamentals/insider workflows, source disclosures, planned $39 Pro pricing, FAQs and an Aethric LLC legal footer.
- Product workspace: shared dark charcoal visual system across dashboard, SEC Research Desk, company research, filing library/detail, watchlist, portfolio, alerts and billing. The dashboard loads live `/v1/filings`, `/v1/transactions`, authenticated `/v1/me/watchlist` and `/v1/me/research-decisions`. It never substitutes invented stock charts or live market prices.
- Legal: `/terms.html`, `/privacy.html` and `/company-info.html` identify Aethric LLC as the operator; contact `hello@aethric.llc`. Terms and privacy have not been represented as attorney-reviewed.
- Account center: `/account.html` uses the existing `/v1/me` and `/v1/auth/logout` endpoints and guarded `DELETE /v1/me` with user confirmation. Sign-up only requests email/password because that's what the backend stores.
- Production safeguards: no artificial AI answers, no fake politicians' transactions, no trading execution; Pro remains visibly *planned* and cannot charge until the billing integration is activated and verified.
- Launch checks: `npm run check`, `npm test`, Railway deploy status, `/healthz`, user registration and account lifecycle spot tests. Client-facing public pages do not require external-market-data credentials.

# Insidir

**Public information. Deeper investigation. Decisions on your terms.** Insidir is building an intelligence-powered investing experience: find overlooked information in lawful public records, connect the evidence, and decide how to act. The current release contains an SEC-focused research engine and website; brokerage trading, AI analysis, and user-authorized automation are roadmap features, not live capabilities.

## Website (`web/`)
- Marketing landing page with scroll-driven animation, a pricing page, sign-in and sign-up, and Terms and Privacy pages
- Product screens: dashboard, company profile, alerts, research desk, and a Form 10-K filing viewer
- Research-first onboarding: successful sign-up and sign-in land on `research.html` to investigate a ticker immediately. Adding a holding or connecting a brokerage is never required to browse SEC research.
- Research desk (`research.html?ticker=AAPL`) connects imported SEC transactions and original filing links to a private, user-authored research journal. Saving a research review never submits an order.
- **Free manual holdings:** signed-in users add tickers and share quantities directly in `portfolio.html`, then see source-linked imported Form 4 activity and links to Research Desk. No Plaid, SnapTrade, live price feed, paid API, or brokerage credentials required. Entries are explicitly user-reported and editable/removable.
- Portfolio screen (`portfolio.html`) supports optional read-only SnapTrade Personal OAuth connections. User tokens are encrypted server-side and holdings are fetched on demand; equity holdings can open the SEC Research Desk and see recent, clearly labeled ticker-only filing matches. Requires a registered SnapTrade OAuth application and production approval.
- Static HTML, CSS and JS with no build step and no third-party requests. Fonts (Inter, JetBrains Mono, Source Serif 4) and imagery are self-hosted
- `npm run web` serves the site without a database at http://localhost:5173. `npm start` serves it from the engine alongside the API

[Website guide](docs/WEBSITE.md)

## Engine (`src/`)
- Real SEC Form 4 XML transaction parsing, with verified source references
- SEC-backed intelligence API: official ticker-to-CIK lookup, company submissions (8-K / 10-K / 10-Q / selected disclosures), and XBRL facts, presented as provenance-linked research observations. Works for SEC-mapped symbols even when the imported Form 4 database has no matching transaction.
- PostgreSQL ingestion, deduplication, source dates and audit history
- APIs for filings, purchases and sales, company and insider search, descriptive purchase clusters, and `GET /v1/intelligence?ticker=AAPL`
- Account sessions, gated watchlists, and a private research-review journal (`GET/POST/DELETE /v1/me/research-decisions`). Reviews can be researching, watching, or passed; they are **never** orders.
- Politician, government, social platform, and crypto sources stay **disabled until legal and data permissions are verified**
- Read-only brokerage connections are **implemented but disabled by default** until the owner configures a registered SnapTrade OAuth application, secret encryption, redirect URI, and brokerage provider access. Personalized trading suggestions and automated order execution are **not implemented** and require separate brokerage permissions and appropriate regulatory review.

[Setup, API and deployment documentation](docs/ENGINE.md) · [Environment template](.env.example)

This is a technical build, not a complete commercial release or legal certification. The product screens show labelled sample data until they are connected to the engine's endpoints.

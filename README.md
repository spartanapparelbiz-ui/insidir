# Insidir

**Public information. Deeper investigation. Decisions on your terms.** Insidir is building an intelligence-powered investing experience: find overlooked information in lawful public records, connect the evidence, and decide how to act. The current release contains an SEC-focused research engine and website; brokerage trading, AI analysis, and user-authorized automation are roadmap features, not live capabilities.

## Website (`web/`)
- Marketing landing page with scroll-driven animation, a pricing page, sign-in and sign-up, and Terms and Privacy pages
- Product screens: dashboard, company profile, alerts, research desk, and a Form 10-K filing viewer
- Research-first onboarding: successful sign-up and sign-in land on `research.html` to investigate a ticker immediately. Adding a holding or connecting a brokerage is never required to browse SEC research.
- Research desk (`research.html?ticker=AAPL`) connects imported SEC transactions and original filing links to a private, user-authored research journal. Saving a research review never submits an order.
- **Free manual holdings:** signed-in users add tickers and share quantities directly in `portfolio.html`, then see source-linked imported Form 4 activity and links to Research Desk. No Plaid, SnapTrade, live price feed, paid API, or brokerage credentials required. Entries are explicitly user-reported and editable/removable.
- Portfolio screen (`portfolio.html`) supports optional read-only SnapTrade Personal OAuth connections. User tokens are encrypted server-side and holdings are fetched on demand; equity holdings can open the SEC Research Desk and see recent, clearly labeled ticker-only filing matches. Requires a registered SnapTrade OAuth application and production approval.
- Static HTML, CSS and JS with no build step and no third-party requests. Fonts and imagery are self-hosted
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

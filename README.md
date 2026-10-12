# Insidir

**Public information. Deeper investigation. Decisions on your terms.** Insidir is building an intelligence-powered investing experience: find overlooked information in lawful public records, connect the evidence, and decide how to act. The current release contains an SEC-focused research engine and website; brokerage trading, AI analysis, and user-authorized automation are roadmap features, not live capabilities.

## Website (`web/`)
- Marketing landing page with scroll-driven animation, a pricing page, sign-in and sign-up, and Terms and Privacy pages
- Product screens: dashboard, company profile, alerts, research desk, and a Form 10-K filing viewer
- Research desk (`research.html?ticker=AAPL`) connects imported SEC transactions and original filing links to a private, user-authored research journal. Saving a research review never submits an order.
- Static HTML, CSS and JS with no build step and no third-party requests. Fonts and imagery are self-hosted
- `npm run web` serves the site without a database at http://localhost:5173. `npm start` serves it from the engine alongside the API

[Website guide](docs/WEBSITE.md)

## Engine (`src/`)
- Real SEC Form 4 XML transaction parsing, with verified source references
- PostgreSQL ingestion, deduplication, source dates and audit history
- APIs for filings, purchases and sales, company and insider search, and descriptive purchase clusters
- Account sessions, gated watchlists, and a private research-review journal (`GET/POST/DELETE /v1/me/research-decisions`). Reviews can be researching, watching, or passed; they are **never** orders.
- Politician, government, social platform, and crypto sources stay **disabled until legal and data permissions are verified**
- Brokerage connections, personalized trading suggestions, and automated order execution are **not implemented** and require brokerage authorization plus appropriate regulatory review before launch

[Setup, API and deployment documentation](docs/ENGINE.md) · [Environment template](.env.example)

This is a technical build, not a complete commercial release or legal certification. The product screens show labelled sample data until they are connected to the engine's endpoints.

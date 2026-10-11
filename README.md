# Insidir

**Financial intelligence from public records.** This repository contains the Insidir engine (SEC ingestion and API) and the Insidir website.

## Website (`web/`)
- Marketing landing page with scroll-driven animation, a pricing page, sign-in and sign-up, and Terms and Privacy pages
- Product screens: dashboard, company profile, alerts, and a Form 10-K filing viewer
- Static HTML, CSS and JS with no build step and no third-party requests. Fonts and imagery are self-hosted
- `npm run web` serves the site without a database at http://localhost:5173. `npm start` serves it from the engine alongside the API

[Website guide](docs/WEBSITE.md)

## Engine (`src/`)
- Real SEC Form 4 XML transaction parsing, with verified source references
- PostgreSQL ingestion, deduplication, source dates and audit history
- APIs for filings, purchases and sales, company and insider search, and descriptive purchase clusters
- Account sessions and gated watchlist support
- Politician, social platform and crypto sources stay **disabled until legal and data permissions are verified**

[Setup, API and deployment documentation](docs/ENGINE.md) · [Environment template](.env.example)

This is a technical build, not a complete commercial release or legal certification. The product screens show labelled sample data until they are connected to the engine's endpoints.

# Insidir website

The marketing site and product screens live in `web/`. They are plain HTML, CSS and JavaScript with no build step, no frameworks and no third-party requests, so they work under the strict Content-Security-Policy the server sends.

## Run it

```bash
npm run web          # website only, no database: http://localhost:5173
npm start            # full engine: API under /v1 and the website on every other path
```

Without the engine, the product screens show their built-in sample data, and the sign-in and sign-up forms drop into a preview of the dashboard. With the engine running, those forms call `POST /v1/auth/login` and `POST /v1/auth/register`, and the company page's "Add to watchlist" calls `POST /v1/me/watchlist`.

## Access

Public pages: the landing page, Platform, Why Insidir, Data, Pricing, About, Terms, Privacy, sign-in, sign-up and Account deleted. Everything else is paid. The engine (`src/paywall.mjs`) redirects signed-out visitors to `signin.html?next=…` and signed-in accounts without an active subscription to `subscribe.html?next=…`; `app.js` does the same when a product request answers 401 or 402. `npm run web` (no database) serves every page ungated for design previews.

## Design system: V13 "Halftone"

Every page shares one print-grain dark identity, taken from the reference footer the client supplied:

| Token | Value | Use |
| --- | --- | --- |
| `--hf-bg` | `#0c0c0b` | night paper, every background |
| `--hf-ink` | `#e9e4da` | text, rules, dots at rest, primary buttons |
| `--hf-warm` | `#e9762b` | a flat accent only: public-page hovers, warnings and validation errors, the wordmark's full stop. Not used in the product chrome, and never a glow: no halo, shadow, gradient or orange-tinted dot |
| `--hf-up` / `--hf-down` | `#2f996a` / `#f94144` | market direction only: purchases, rises and gains in green; sales, falls and losses in red. Always beside a word, a sign or a ▲/▼ marker; never on `--hf-raise` text (4.45:1) |
| `--hf-surface` / `--hf-surface-2` / `--hf-raise` | ink 4 % / 7 % / 10 % over paper | panels, tiles, inputs |
| `--hf-line` / `--hf-line-2` | ink 16 % / 24 % | hairline rules and borders |
| `--hf-faint` / `--hf-muted` / `--hf-soft` | ink 54 % / 55 % / 75 % | labels (4.7:1), secondary copy (5.2:1), soft copy |

Type is one face, JetBrains Mono (`--hf-mono`; `--hf-sans` is an alias): tracked uppercase micro-labels (10.5px, letter-spacing .18em), navigation, buttons, table heads, badges, captions and body copy, and the same face at 700–800 with -.03em tracking for headings, numbers and the `insidir` wordmark, whose full stop is set in warm. Corners are square, rules are 1px hairlines, nothing casts a shadow, photographs are grayscale with a hint of sepia, and a fine grain sits over the whole page.

`assets/css/v13-halftone.css` holds the tokens and the shared primitives (navigation, product header, buttons, inputs, tables, panels, signals, charts, the footer). It lives in the `insidir-v13` cascade layer and every declaration is `!important`: important declarations in a layer beat the unlayered `!important` rules of the older v2–v12 stylesheets regardless of specificity, so the identity is applied without editing them. The per-family files (`v13-home.css`, `v13-app.css`, `v13-desk.css`, `v13-auth.css`, `v13-static.css`, `v13-company.css`, `v13-notfound.css`) follow the same rule. Keep it when adding styles: new rules go inside the family file's `@layer insidir-v13{}` block, prefixed with `body.v13`, every declaration `!important`, colours only through the tokens.

The landing page's first screen is the halftone wordmark hero (`section.v13-hero[data-halftone-hero]`): `assets/js/v13-halftone.js` sets `insidir` at a size that fills the width, cropped by the bottom edge, and prints it as dots sized by how much of the letter covers each 6px cell. Dots part around the pointer on springs and stay ink (nothing on the site glows orange); a click sends a ring through the word; everything sleeps once the dots are home and pauses off-screen; `prefers-reduced-motion` prints it still. The engine reads its colours from `--hwf-bg` and `--hwf-ink`, and the word, crop, dot gap and push radius from `data-` attributes. It is deliberately used nowhere else — every page ends with the plain tracked footer (`footer.v13-footer--plain`).

### Motion: the whole site moves like the wordmark

The landing wordmark's dots part around the pointer, spring back home and ripple when you click. That motion — not the word — is the feel of every page, with one set of numbers: `window.InsidirHalftone.PHYSICS` in `assets/js/v13-halftone.js` (`push` 2.6 within the radius, `spring` 0.05 home, `damping` 0.84 per 60 fps frame; a click ring at 0.9 px/ms, 26px wide, force 3.2, for 900ms).

- **Dot fields.** Any element with `data-halftone-field` becomes a canvas of ink dots driven by that engine (options: `data-dot-gap`, `data-radius`, `data-field-coverage`, and `data-pointer-host="document"` for a field that should part around the pointer wherever it is on the page, as the marketing and legal hero fields do). Every plain footer gets a field strip across its top automatically, in space the footer reserves so nothing shifts when it arrives; each page family adds calm fields in its empty zones (hero bands, side panels, header bands). The giant word stays only in the landing hero. A field scrolled out of view puts its dots home and sleeps; a field at rest, or held in balance by a resting pointer, stops drawing until the pointer moves again.
- **Atoms.** `assets/js/v13-motion.js` gives small free-standing elements (navigation, buttons, chips, index numbers, arrows, identity tiles, footer links) the same push and spring, scaled so an atom moves at most ~7px; the element under the pointer holds still so it can be clicked. Opt in with `data-hf-atom`, out with `data-hf-still`. Reading text, headings, numbers, tables, inputs and ruled grids never move. Offsets ride on `translate` via `--hf-dx`/`--hf-dy`. Homes are re-measured on resize, after reveal and transition animations end, and on scroll for atoms inside sticky boxes; the physics runs on a fixed 60 fps clock, so a 120 Hz or 144 Hz screen moves exactly like a 60 Hz one.
- **One click ring.** A click on empty space sends a single ring through every atom and every dot field on the page, exactly like a click on the word.
- **Spring easing.** `--hf-spring` is the dots' spring sampled into a CSS `linear()` curve (950ms, overshoots 25% then 6%) with `--hf-spring-dur`; movement transitions use it so hovers settle like the dots. `test/motion.test.mjs` re-simulates the physics and fails if the curve drifts.
- **Reduced motion.** With `prefers-reduced-motion` the dots are drawn still and no atom moves. Touch screens get the ring but no hover push.

`node scripts/motion-check.mjs` verifies all of this on every page in Chrome (fields mounted and drawn, atoms parting and returning home, the atom under the pointer holding still, the click ring reaching every field, reduced motion still, phones without overflow); CI runs it after the palette audit.

`node scripts/v13-palette-audit.mjs` is the acceptance gate (CI runs it after the layout and dashboard checks): it renders every page at 1440px and 390px in headless Chromium with the `/v1` routes mocked, and fails on any computed colour that is not a blend of the three identity colours, text below 4.5:1 contrast (3:1 for large text), any font other than JetBrains Mono on visible text, a raster image whose native pixels are less than twice its rendered size, any orange glow (a shadow, filter, gradient or gradient-filled chart carrying the accent, or an orange pixel on the landing wordmark while the pointer pushes its dots and after a click), horizontal overflow, browser errors, a missing plain footer, a landing hero whose wordmark did not draw, or a dotted wordmark on any other page. `node scripts/dashboard-check.mjs` tests the dashboard's behaviour in Chrome. `--pages`, `--widths`, `--shots dir` and `--json file` narrow it and keep screenshots for review.

## Pages

| Page | File | Notes |
| --- | --- | --- |
| Landing | `index.html` | Opens on the halftone wordmark hero, then the six tools, where the data comes from, how it works, the four rules, the single plan, FAQ and a closing call to action. No product data and no links into paid pages (`v13-home.css`, `v9-motion.js`, `v6-site.js` for the menu) |
| Platform | `platform.html` | Every tool explained, with a section per tool that the landing cards link to |
| Why Insidir | `why-insidir.html` | The principles: original sources, evidence over predictions, not a broker, no made-up numbers |
| Data | `data.html` | Each source, what Insidir uses it for, freshness, licensing and limits |
| Subscribe | `subscribe.html` | The paywall: plan, what is included, Stripe checkout, and honest states when checkout is not open or the subscription is already active (`subscribe.js`, `v13-paywall.css`) |
| Billing / Account | `billing.html`, `account.html`, `account-deleted.html` | Subscription status and the Stripe portal; account deletion, which cancels the subscription first, then a confirmation page |
| Pricing | `pricing.html` | Free and Pro plans, comparison table, FAQ |
| Sign in / Sign up | `signin.html`, `signup.html` | Wired to the engine's auth API, with client-side validation |
| Dashboard | `dashboard.html` | Insider flow (totals, net value, other codes, filing lag; value by trade date with a table view; by company; largest transactions), watchlist, notes, insider transactions with exact shares, prices, values and dates, latest filings, data source, reporting people |
| Company | `company.html?ticker=AAPL` | V12 dark market terminal for any SEC-listed ticker: delayed price chart (1D–5Y), key facts, and Overview, Financials, SEC filings, Insider activity, People and News tabs (`v12-company.css`, `v12-company.js`). Without a ticker it shows a company picker |
| Alerts | `alerts.html` | Type filters, expandable rows, "Manage alerts" drawer |
| Filing viewer | `filing.html` | Form 10-K outline with scrollspy, plus a document pane |
| Terms / Privacy | `terms.html`, `privacy.html` | Numbered sections with a sticky table of contents |
| Not found | `404.html` | Served for unknown extensionless paths |

## Structure

```
web/
  assets/css/base.css     design tokens, type, buttons, forms, navigation, motion primitives
  assets/css/app.css      product UI: panels, tables, tabs, segmented controls, charts
  assets/css/<page>.css   page layout
  assets/css/v13-halftone.css   the V13 identity: tokens and shared primitives (loaded last on every page)
  assets/css/v13-<family>.css   per-family V13 layout detail (home, app, desk, auth, static, company, notfound)
  assets/js/v13-halftone.js     halftone wordmark engine (landing hero) and the footer's back-to-top
  assets/js/motion.js     scroll animation engine (declarative data attributes)
  assets/js/site.js       mobile menu, accordions, toasts
  assets/js/app.js        product header, charts, sparklines, monogram avatars, API helper
  assets/js/<page>.js     page behaviour and sample data
  assets/fonts/           Inter, JetBrains Mono and Source Serif 4 (variable, latin + latin-ext, SIL OFL)
  assets/img/             photography
  assets/icons/           favicon and company marks
```

## Motion system

`motion.js` reads data attributes, so pages declare their animation in markup:

- `data-reveal="up|down|left|right|scale|blur|fade|mask|mask-x|card"` animates an element in the first time it scrolls into view. Use `data-delay="120"` to delay it, or put `data-stagger="90"` on a parent to cascade its children.
- `data-split` makes heading words rise out of a mask. `data-count` makes a number count up to its final text. `data-draw` draws SVG chart lines. `data-rule` grows dividers.
- `data-parallax`, `data-parallax-x` and `data-parallax-scale` drive parallax layers.
- `data-progress="travel|exit|enter|pin"` exposes scroll progress as the CSS variable `--p` (0 to 1). Use `pin` on a tall wrapper around a `position: sticky` stage to scrub a pinned scene. `data-progress-max` stops updating once a scene has finished.
- `data-words` splits text into indexed words (`--i`, `--n`) for scroll-scrubbed reading effects.
- `data-vel` gives an element and its descendants `--vel`, the smoothed scroll velocity from −1 to 1. Use it for skew and stretch while scrolling fast.
- `data-magnetic` makes a button follow the pointer slightly. `body[data-smooth]` turns on inertial wheel scrolling (desktop only).

Reveals wait until the page has faded in, so entrance staggers are always seen. Anything still hidden is revealed the moment it receives keyboard focus. In-page links move focus to their target as well as scrolling to it.

Everything runs from a single `requestAnimationFrame` loop that reads layout before writing styles. Only `transform`, `opacity`, `filter` and `clip-path` are animated. Per-frame scrub values are registered with `@property`, so they are cheap to update. Pinned scenes and 3D effects run on desktops 900px and wider; smaller and touch screens get lighter reveal-based versions. Under `prefers-reduced-motion`, all content shows immediately with no movement. Without JavaScript, nothing is hidden.

## Imagery

All photography is self-hosted in `web/assets/img/` and was upscaled 4× with ESRGAN (`@upscalerjs/esrgan-thick`, run locally through TensorFlow.js):

- The hero, sign-in, sign-up and dashboard skyline are cropped from the design reference images. The baked-in interface text was removed with a column-wise fill.
- The section cards, side photos, bull, NYSE facade and the Brooklyn Bridge call to action come from the clean photo collage supplied with the brief.

To swap in higher-resolution originals, replace a file and keep its name and roughly its aspect ratio. Each page crops with `object-fit: cover`.

People appear as initials avatars: the reference portraits were too small to recover, and they depicted real public figures. Company marks come from Simple Icons (CC0), except Microsoft, which is drawn from four squares. The trademarks belong to their owners.

## Differences from the reference

These are intentional:

- The product screens' greeting and market status follow the visitor's clock and New York market hours.
- The company chart opens on **1Y**, because its axis spans January to December.
- The filing outline lists "Item 6. [Reserved]", which is correct for a fiscal-2023 10-K.
- Gain and loss text uses slightly darker green and red so it meets WCAG AA contrast. Charts keep the brighter reference colours (`--green-chart`, `--red-chart`).
- Small "Sample data" labels mark illustrative figures.
- Under 860px, a menu button opens the product navigation.
- The reference's mock-up artefacts are not reproduced: a Microsoft logo on an Apple alert, a duplicated "About" link, and a stray comma.

## Company report data

The company page calls `/v1/intelligence`, `/v1/market/chart`, `/v1/company/profile`, `/v1/company/insiders`, `/v1/company/news`, `/v1/company/logo` and `/v1/company/photos` in parallel and renders each section as its data arrives. Every value is sourced: SEC EDGAR/XBRL for financials, filings and Form 4 activity; Yahoo Finance for delayed prices; Wikidata/Wikipedia for founding year, employees, website, logo, leadership photos and the description. Calculated values (market cap = price × shares outstanding, enterprise value = market cap + debt − cash and short-term investments, P/E = price ÷ trailing diluted EPS) explain their inputs in a tooltip and are skipped for foreign issuers whose listed shares may be ADRs. Logos are prepared on the server (see docs/ENGINE.md): the real mark sits directly on the page background with no tile or box, and a company without a verifiable logo shows no logo rather than a stand-in. People show a verified photo (Wikimedia Commons, the company's own site or an SEC proxy statement, credited on hover) or their initials; the page checks back while photo sources finish.

## Before launch

- Product screens use clearly labelled sample data. Connect them to the engine's endpoints (`/v1/filings`, `/v1/transactions`, `/v1/companies`, `/v1/me/watchlist`, `/v1/me/alerts`) before presenting them as live.
- The Terms and Privacy pages describe how the engine currently works, but counsel must review them before public sign-ups are enabled (`ALLOW_SIGNUP=1`).
- Political-disclosure features appear in the marketing copy, but the engine keeps those sources disabled until licensing is cleared (see `docs/ENGINE.md`).

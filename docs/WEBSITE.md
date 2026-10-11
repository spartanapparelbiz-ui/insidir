# Insidir website

The marketing site and product screens live in `web/`. They are plain HTML, CSS and JavaScript with no build step, no frameworks and no third-party requests, so they work under the strict Content-Security-Policy the server sends.

## Run it

```bash
npm run web          # website only, no database: http://localhost:5173
npm start            # full engine: API under /v1 and the website on every other path
```

Without the engine, the product screens show their built-in sample data, and the sign-in and sign-up forms drop into a preview of the dashboard. With the engine running, those forms call `POST /v1/auth/login` and `POST /v1/auth/register`, and the company page's "Add to watchlist" calls `POST /v1/me/watchlist`.

## Pages

| Page | File | Notes |
| --- | --- | --- |
| Landing | `index.html` | Full-viewport hero, nine animated sections, FAQ, final call to action |
| Pricing | `pricing.html` | Free and Pro plans, comparison table, FAQ |
| Sign in / Sign up | `signin.html`, `signup.html` | Wired to the engine's auth API, with client-side validation |
| Dashboard | `dashboard.html` | Market cards, insider activity filter, watchlist, filings, political trades |
| Company | `company.html?ticker=AAPL` | Price chart with ranges and tabs for insider activity, filings, financials, ownership and news |
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
  assets/js/motion.js     scroll animation engine (declarative data attributes)
  assets/js/site.js       mobile menu, accordions, toasts
  assets/js/app.js        product header, charts, sparklines, monogram avatars, API helper
  assets/js/<page>.js     page behaviour and sample data
  assets/fonts/           Source Serif 4 and Inter (variable, latin + latin-ext, SIL OFL)
  assets/img/             photography
  assets/icons/           favicon and company marks
```

## Motion system

`motion.js` reads data attributes, so pages declare their animation in markup:

- `data-reveal="up|down|left|right|scale|blur|fade|mask|mask-x|card"` animates an element in the first time it scrolls into view. Use `data-delay="120"` to delay it, or put `data-stagger="90"` on a parent to cascade its children.
- `data-split` makes heading words rise out of a mask. `data-count` makes a number count up to its final text. `data-draw` draws SVG chart lines. `data-rule` grows dividers.
- `data-parallax`, `data-parallax-x` and `data-parallax-scale` drive parallax layers. `data-progress="travel|exit|enter"` exposes the scroll progress as the CSS variable `--p` for custom scrubbing, such as the hero fading out.
- `data-magnetic` makes a button follow the pointer slightly. `body[data-smooth]` turns on inertial wheel scrolling (desktop only).

Everything runs from a single `requestAnimationFrame` loop and animates only `transform`, `opacity`, `filter` and `clip-path`. Under `prefers-reduced-motion`, all content shows immediately with no movement. Without JavaScript, nothing is hidden.

## Imagery

The photographs were taken from the design reference images. The baked-in interface text was removed with a column-wise fill, and the crops were upscaled 4× with ESRGAN (`@upscalerjs/esrgan-thick`, run locally through TensorFlow.js). The reference avatars were too small to recover and showed real public figures, so people appear as initials avatars instead. Company marks come from Simple Icons (CC0), except Microsoft, which is drawn from four squares. The trademarks belong to their owners.

To swap in higher-resolution originals, replace the files in `web/assets/img/` and keep the same names and aspect ratios.

## Before launch

- Product screens use clearly labelled sample data. Connect them to the engine's endpoints (`/v1/filings`, `/v1/transactions`, `/v1/companies`, `/v1/me/watchlist`, `/v1/me/alerts`) before presenting them as live.
- The Terms and Privacy pages describe how the engine currently works, but counsel must review them before public sign-ups are enabled (`ALLOW_SIGNUP=1`).
- Political-disclosure features appear in the marketing copy, but the engine keeps those sources disabled until licensing is cleared (see `docs/ENGINE.md`).

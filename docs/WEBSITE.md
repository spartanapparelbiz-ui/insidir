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
| Landing | `index.html` | Scroll-scrubbed scenes. The hero photo splits into doors that open onto the skyline. A ticker strip and word-by-word reading lead into a card deal and aperture-lens reveals. Research cards stand up, and an outlined records marquee runs behind its section. The bronze bull charges in, then the closing call to action opens like a portal (styles and scripts in `fx-top`, `fx-mid` and `fx-end`) |
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

## Before launch

- Product screens use clearly labelled sample data. Connect them to the engine's endpoints (`/v1/filings`, `/v1/transactions`, `/v1/companies`, `/v1/me/watchlist`, `/v1/me/alerts`) before presenting them as live.
- The Terms and Privacy pages describe how the engine currently works, but counsel must review them before public sign-ups are enabled (`ALLOW_SIGNUP=1`).
- Political-disclosure features appear in the marketing copy, but the engine keeps those sources disabled until licensing is cleared (see `docs/ENGINE.md`).

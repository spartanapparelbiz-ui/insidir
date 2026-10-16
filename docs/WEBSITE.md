# Insidir website

The marketing site and product screens live in `web/`. They are plain HTML, CSS and JavaScript with no build step, no frameworks and no third-party requests, so they work under the strict Content-Security-Policy the server sends.

## Run it

```bash
npm run web          # website only, no database: http://localhost:5173
npm start            # full engine: API under /v1 and the website on every other path
```

Without the engine, the product screens show their built-in sample data, and the sign-in and sign-up forms drop into a preview of the dashboard. With the engine running, those forms call `POST /v1/auth/login` and `POST /v1/auth/register`, and the company page's "Add to watchlist" calls `POST /v1/me/watchlist`.

## Access

Public pages: the landing page, Platform, Why Insidir, Data, Pricing, About, Terms, Privacy, sign-in, sign-up and Account deleted. Everything else is paid, the personnel files (`person.html?cik=…`) included. The engine (`src/paywall.mjs`) redirects signed-out visitors to `signin.html?next=…` and signed-in accounts without an active subscription to `subscribe.html?next=…`; `app.js` does the same when a product request answers 401 or 402. `npm run web` (no database) serves every page ungated for design previews.

## Design system: V13 "Halftone"

Every page shares one print-grain dark identity, taken from the reference footer the client supplied:

| Token | Value | Use |
| --- | --- | --- |
| `--hf-bg` | `#0c0c0b` | night paper, every background |
| `--hf-ink` | `#e9e4da` | text, rules, dots at rest, primary buttons |
| `--hf-warm` | retired (an alias of `--hf-ink`) | nothing on the site is orange: the logo's full stop, the favicon dot, hovers, selection, markers and numbers are ink. A rule that still names the token prints ink, and `test/web.test.mjs` fails if any V13 stylesheet, page or script names it |
| `--hf-up` / `--hf-down` | `#2f996a` / `#f94144` | market direction only: purchases, rises and gains in green; sales, falls and losses in red. Always beside a word, a sign or a ▲/▼ marker; never on `--hf-raise` text (4.45:1) |
| `--hf-alert` | `var(--hf-down)` | errors, invalid fields, failed or slow states and destructive actions (delete account) |
| `--hf-up-tint` / `--hf-down-tint` | green / red 14 % over paper | the fill of a Bought / Sold badge (the word stays green or red, 4.7:1) |
| `--hf-surface` / `--hf-surface-2` / `--hf-raise` / `--hf-raise-2` | ink 4 % / 7 % / 10 % / 14 % over paper | panels (every dashboard module, KPI strip, charts, the pricing card, auth and paywall cards), skeletons, popovers and menus |
| `--hf-line-faint` / `--hf-line` / `--hf-line-2` / `--hf-line-strong` | ink 10 % / 16 % / 24 % / 42 % | row dividers inside panels; panel borders and header/footer rules; section rules, secondary buttons and chips; input borders (3.46:1) |
| `--hf-faint` / `--hf-muted` / `--hf-soft` | ink 58 % / 66 % / 80 % | labels, column heads, timestamps (5.6:1); body copy and meta (7.1:1); ledes, asides and secondary values (10:1) |

Type is one face, JetBrains Mono (`--hf-mono`; `--hf-sans` is an alias), at one scale: the landing headline `--hf-fs-display` (about 92px at 1440, 40px on a phone), marketing section heads `--hf-fs-h2-lg` (52px), product page titles `--hf-fs-h1` (40px), product module heads `--hf-fs-h2` (22px), card and step titles `--hf-fs-h3` (18px), body 13–16px; headings at 700 with negative tracking, weight 800 only for the logo, the wordmark and the footer brand. Capitals are for labels only, at `--hf-label` (500 11px/16px) and `--hf-track` (.12em): eyebrows and running heads, table column heads, panel and KPI labels, badges and the New mark, footer column heads. Everything you press or follow (navigation, buttons, action links, chips, tabs, footer links) is sentence case. Figures use tabular numerals; coding ligatures are off.

One container sets every edge: `min(--hf-max, 100% − 2 × --hf-gutter)` (1320px wide, 1440px from 1600px screens; the gutter runs from 20px on a phone to 60px), so the logo, the first character of the content and the footer brand line up on every page (x = 60 at 1440, x = 20 at 390). Corners are square (the avatar and dots excepted), rules are 1px hairlines, panels carry a 1px top highlight and popovers a paper-coloured shadow, focus is a 2px ink ring, photographs are grayscale, and a fine grain sits over the whole page. Hover changes colour and underlines only: no row or card fills, nothing moves.

`assets/css/v13-halftone.css` holds the tokens and the shared primitives (navigation, product header, buttons, inputs, tables, panels, signals, charts, the footer). It lives in the `insidir-v13` cascade layer and every declaration is `!important`: important declarations in a layer beat the unlayered `!important` rules of the older v2–v12 stylesheets regardless of specificity, so the identity is applied without editing them. The per-family files (`v13-home.css`, `v13-app.css`, `v13-desk.css`, `v13-auth.css`, `v13-static.css`, `v13-company.css`, `v13-notfound.css`) follow the same rule. Keep it when adding styles: new rules go inside the family file's `@layer insidir-v13{}` block, prefixed with `body.v13`, every declaration `!important`, colours only through the tokens.

The landing page's first screen is the halftone wordmark hero (`section.v13-hero[data-halftone-hero]`): `assets/js/v13-halftone.js` sets `insidir` at a size that fills the width, cropped by the bottom edge, and prints it as dots sized by how much of the letter covers each 6px cell. Its dots blow apart around the pointer, sweep after it and ring out on every click or tap like every dot field on the site (see [Motion](#motion-still-content-live-dots)), always in ink (nothing on the site glows orange); nothing happens when the page scrolls; everything sleeps once the dots are home and pauses off-screen; `prefers-reduced-motion` prints it still. The engine reads its colours from `--hwf-bg` and `--hwf-ink`, and the word, crop, dot gap and push radius from `data-` attributes. It is deliberately used nowhere else — every page ends with the plain tracked footer (`footer.v13-footer--plain`).

### Motion: still content, live dots

The page's content holds still. Nothing a reader aims at, reads or compares moves under the pointer, on a click or with a scroll. The dots are the exception, and they answer everything: every halftone dot field on the site (the landing wordmark, the page bands, the marketing heroes and closing panels, the sign-in panel, the plan card, the 404's numerals, the overview's brief corner and the footer strip on every page) blows apart around the pointer, sweeps after it, opens wider under a press and rings out on every click or tap, then springs home and settles by itself. Only canvas dots move.

- **The physics.** `window.InsidirHalftone.PHYSICS` in `assets/js/v13-halftone.js`: within a field's radius the pointer pushes each dot with up to `push` 4 per 60 fps frame and drags what it passes with `drag` 0.14 of its own movement; a `spring` of 0.045 pulls home and `damping` keeps 0.85 of the velocity each frame, so a resting pointer clears a hole some 50px across and a dot thrown out swings back once and is home in about a second. Holding the button (or a finger) down pushes `press` 2.2 times as hard over `pressReach` 1.35 times the radius. Every press or tap sends a ring out at `ringSpeed` 1.05 px/ms, `ringBand` 36px wide, `ringForce` 4, for `ringLife` 1300ms, through every field it can reach; up to `rings` 6 run at once. A scroll never pushes a dot (a field only slides under a resting pointer), and the hero does not scatter as it scrolls away. The physics runs on a fixed 60 fps clock, so a 120 Hz or 144 Hz screen moves exactly like a 60 Hz one.
- **Dot fields.** Any element with `data-halftone-field` becomes a canvas of ink dots drawn by that engine (options: `data-dot-gap`, `data-radius` — the pointer's reach in px, 170 by default, 130 for a word — and `data-field-coverage`; `data-mode="word"` with `data-wordmark` prints a word). Every field follows the pointer across the whole page (listeners on `document`) and wakes only when the pointer comes within reach; `data-interactive="false"` would make one still print, and no page uses it. Every plain footer gets a field strip across its top automatically, in space the footer reserves so nothing shifts when it arrives. The giant word stays only in the landing hero. All dots of a field are drawn as one path in one fill; a dot at rest and out of reach costs nothing; a field scrolled out of view puts its dots home and sleeps; a field at rest stops drawing. Fields sit behind content with `pointer-events: none`, so they never take a click from a link or button.
- **No moving elements.** `assets/js/v13-motion.js` moves no element: navigation, buttons, chips, index numbers, arrows, identity tiles and footer links stay put under the pointer, on a press, on a click and on a scroll (there are no `--hf-dx`/`--hf-dy`/`--hf-s` offsets or `[data-hf-atom]` translate rules; a leftover `data-hf-atom` attribute in markup is inert). Hover, focus and press states change colour, borders and underlines only, never position or size.
- **Easing.** `--hf-spring` is a plain ease-out, `cubic-bezier(.22,.61,.36,1)` over `--hf-spring-dur` (.28s), with no overshoot. It is used for the few state changes a reader starts (a drawer opening, a menu toggle, a switch), never for hover.
- **Scroll reveal, public pages only.** Mark a block `data-hf-reveal`, or a container `data-hf-reveal-group` (each direct child reveals in turn); footer columns reveal on their own. On a public page (neither `body.app-body` nor `body.v6-app`), a block still below 92% of the viewport when it is first shown waits transparent and 12px low (`.hf-pending`) and fades up into place once as it scrolls in (`.hf-revealing`: opacity over .5s and the 12px over .62s, a short ease-out, no spring), a short beat (60ms, at most four beats) after the block that arrived with it. The product's own pages (`body.app-body`: the overview, explore, filings and filing, watchlist, alerts, people, personnel files, account, billing and company reports) never hold anything back: their content is simply there and `InsidirMotion.pending` stays 0. Content on screen at load or added on screen later is never hidden; blocks inside hidden containers are considered once shown; a jump past blocks shows them at once; focus inside a waiting block shows it; nothing waits under reduced motion, in print, or when a tool calls `window.InsidirMotion.revealAll()`. Never tag table rows, inputs, or an ancestor of a fixed or sticky element.
- **Reduced motion.** With `prefers-reduced-motion` every dot field is drawn still (no field listens to the pointer at all) and nothing waits to be revealed.

`node scripts/motion-check.mjs` verifies still content and live dots on every page in Chrome with a real mouse and wheel: dot fields mounted and drawn; about 40 sampled elements per page (navigation, buttons, chips, links, tiles, logos, index numbers) keep their box and transform while the pointer sweeps over and near them, while they are pressed and released, after a click on empty space, and during eight wheel steps (nothing lags); nothing writes a pointer or scroll offset; hovering a link or button moves neither it, its children nor their `::before`/`::after`; no dot field changes with a scroll; every dot field (up to three per page) changes under a pointer sweep and with a click, and is pixel-identical to its at-rest image again within 2.5s of the pointer leaving its reach; every word field (the landing wordmark, the 404) answers hard and is back at rest within 2.5s; the landing wordmark does not scatter when the page is scrolled; the scroll reveal on public pages (waiting blocks at most 16px off, each shown within 1.2s, nothing left pending) and nothing held back on product pages, at 1440px and 390px; reduced motion: every dot canvas holds still under the pointer and a press; no orange pixels while the pointer rests on an element or after a click; phones without overflow. CI runs it after the palette audit. The personnel file is checked with a file (`person`) and without one (`person-404`), from a `/v1/people/<cik>` mock in the API's shape.

`node scripts/v13-palette-audit.mjs` is the acceptance gate (CI runs it after the layout and dashboard checks): it renders every page at 1440px and 390px in headless Chromium with the `/v1` routes mocked, and fails on any computed colour that is not a blend of the three identity colours, text below 4.5:1 contrast (3:1 for large text), any font other than JetBrains Mono on visible text, a raster image whose native pixels are less than twice its rendered size, any orange glow (a shadow, filter, gradient or gradient-filled chart carrying the accent, or an orange pixel on the landing wordmark while the pointer pushes its dots and after a click), horizontal overflow, browser errors, a missing plain footer, a landing hero whose wordmark did not draw, or a dotted wordmark on any other page. The personnel file is rendered twice: Tim Cook's file (`person`, from a `/v1/people/1214156` mock in the shape `src/person-profile.mjs` answers, with an amended line and a joint filing) and a CIK with no file (`person-404`). `node scripts/dashboard-check.mjs` tests the dashboard's behaviour in Chrome. `--pages`, `--widths`, `--shots dir` and `--json file` narrow it and keep screenshots for review.

## Pages

| Page | File | Notes |
| --- | --- | --- |
| Landing | `index.html` | Opens on the halftone wordmark hero, then the six tools, where the data comes from, how it works, the four rules, the single plan, FAQ and a closing call to action. No product data and no links into paid pages (`v13-home.css`, `v9-motion.js`, `v6-site.js` for the menu) |
| Platform | `platform.html` | Every tool explained, with a section per tool that the landing cards link to |
| Why Insidir | `why-insidir.html` | The principles: original sources, evidence over predictions, not a broker, no made-up numbers |
| Data | `data.html` | Each source, what Insidir uses it for, freshness, licensing and limits |
| Subscribe | `subscribe.html` | The paywall: plan, what is included, Stripe checkout, and honest states when checkout is not open or the subscription is already active (`subscribe.js`, `v13-paywall.css`) |
| Billing / Account | `billing.html`, `account.html`, `account-deleted.html` | Subscription status and the Stripe portal; account deletion, which cancels the subscription first, then a confirmation page |
| Pricing | `pricing.html` | The single $39/month plan (no free tier), how it works, billing details, FAQ |
| Sign in / Sign up | `signin.html`, `signup.html` | Wired to the engine's auth API, with client-side validation |
| Overview (dashboard) | `dashboard.html` | Today, 01 People you follow (their latest trades, marked New since your last visit), 02 Your watchlist and 02b Your notes, 03 Across the market, 04 All recent trades, 05 About this data; see [The overview](#the-overview-dashboardhtml) (`v3-dashboard.js`, `v4-dashboard.js`, `v13-overview.js`, `v13-dashboard.css`) |
| People | `people.html` | SEC reporting people: Familiar faces, the people you follow (Follow / Unfollow in place) and a directory searchable by name (`?q=` runs a search and brings the directory into view), 24 at a time; every name opens that person's file (`v10-people.js`) |
| Personnel file | `person.html?cik=1214156` | One reporting person's public SEC record, styled as a declassified file: file photo or the company logo standing in, name as filed, roles per company, record (all imported records against the last 30 days, exact), known affiliations plus other EDGAR issuers, activity log in plain words (25 at a time), Form 4 list with SEC links; follow with Undo; states for 404, bad CIK, 503, 401 and 402; see [The personnel file](#the-personnel-file-personhtml) (`person.js`, `v13-person.css`, `GET /v1/people/<cik>`) |
| Company | `company.html?ticker=AAPL` | V12 dark market terminal for any SEC-listed ticker: delayed price chart (1D–5Y), key facts, and Overview, Financials, SEC filings, Insider activity, People and News tabs (`v12-company.css`, `v12-company.js`). Without a ticker it shows a company picker |
| Alerts | `alerts.html` | Type filters, expandable rows, "Manage alerts" drawer |
| Filing viewer | `filing.html` | Form 10-K outline with scrollspy, plus a document pane |
| Terms / Privacy | `terms.html`, `privacy.html` | Numbered sections with a sticky table of contents |
| Not found | `404.html` | Served for unknown extensionless paths |

## The overview (`dashboard.html`)

The signed-in home page reads top to bottom as: what changed for you, the people you follow, your companies and notes, then the market. Every figure is exact (shares and prices as filed, dollar values to the cent), every row comes from an imported SEC record and links to an Insidir page or the original filing, and nothing is invented: no prices, returns or sample rows.

- **Today** (`#rd-today`): the greeting, then three sentences: what changed since your last visit among the people you follow and the companies you watch (the counts match the New markers below), what the latest imported trades add up to across the market (the same figures as 03), and how fresh the import is.
- **01 People you follow** (`GET /v1/me/people/updates?limit=40`, `v13-overview.js`): *Latest trades*, the newest Form 4 lines your people filed, newest filing first, each one plain-English sentence with the person's headshot and the company's logo (8 at first, the rest of the 40 under "Show N more trades"); *Following*, each person with their last 30 days (bought, sold, trades), how many of their lines are new, and a Following ✓ button (6, then "and N more"); and suggestions, the most active people in the latest 100 imported trades ranked by priced value (plus `/v1/insiders` while you follow fewer than 3), each with Follow +: six in place of the feed when you follow nobody, four otherwise. Follow and unfollow happen in place: the button flips at once and flips back with the reason if the server says no, a new person and their trades rise into space the module already holds, and an unfollowed person dims with Undo for 6 seconds.
- **New since your last visit.** `localStorage["insidir:overview:last-seen"]` is read once before anything renders; a row is New when it was imported (`created_at`, else `published_at`) after it. The time of this visit is written when the page is hidden or left, and only after it has been seen for 4 seconds.
- **02 Your watchlist and 02b Your notes**: the latest purchase or sale at each saved company (at most 8 per-ticker lookups for tickers outside the latest 100 trades), marked New like the feed, with Save suggestions when the list is empty; your private research notes, most recent first.
- **03 Across the market**, for the latest 100 imported trades: purchases and sales (value, count, shares), the net, lines under other Form 4 codes (counted, never valued) and the median filing lag; *Bought and sold, by trade date* (a diverging chart with a Chart / Table switch); *By company*; *Biggest trades* (shares × price as filed). Green for purchases and rises, red for sales and falls, always beside a word, a sign or a ▲/▼.
- **04 All recent trades**: every line of every filing, newest trade first, with All / Purchases / Sales / Other filters that crossfade inside a height-locked table; signed shares, price, value, trade and filing dates, ownership and the SEC meaning of each code.
- **05 About this data**: the source (SEC EDGAR, Form 4), the engine's status, filings imported, the last import and the newest filing, with a link to how the data works.

How it loads and moves: every request starts once, as soon as the script runs (`/v1/me/people/updates`, `/v1/me/watchlist`, `/v1/me/research-decisions`, `/v1/transactions?limit=100`, `/v1/status`, `/v1/filings?limit=1`, the per-ticker lookups, and the one `/v1/media` batch for the tiles). The first screen renders as soon as its data is in; everything below renders in idle slices, one module per slice. Skeletons are sized from the counts this browser saved at the last visit (`localStorage["insidir:overview:counts"]`), so nothing moves when the data arrives; the overview is a product page, so nothing is held back for a scroll reveal and nothing moves under the pointer or while the page scrolls. A failure says what failed, in place, with a Try again that reloads only that module; 401 and 402 go to sign in and subscribe. Every person's name opens their file (`person.html?cik=<owner CIK without leading zeros>`, or the directory search `people.html?q=<name>#v10-directory` when no CIK is known), and the Form 4 wording comes from `form4-words.js` (`window.InsidirForm4`), shared with the personnel file so a trade reads the same sentence on both pages. `node scripts/dashboard-check.mjs` checks all of this in Chrome.

## The personnel file (`person.html`)

Every reporting person has a file of their own at `person.html?cik=<SEC owner CIK>` (with or without leading zeros), styled as a declassified personnel file and honest about it: everything on it is a public SEC record Insidir has imported, nothing is hidden, redacted, invented or inferred, and it gives no advice. It reads `GET /v1/people/<cik>` (contract in [ENGINE.md](ENGINE.md#personnel-file-get-v1peoplecik) and the header of `src/person-profile.mjs`).

- **The subject**: the file photo (a real headshot, or the company's logo standing in; see Identity tiles), the name as people write it and as filed, roles per company as stated in the filings, the SEC CIK, how much is on file, the earliest trade and the last filing, Follow + (live, with Undo), the company report and the SEC EDGAR record.
- **01 Record**: purchases, sales, other lines, net and the median filing delay, exact, for all imported records against the last 30 days. A line a later Form 4/A repeats is listed in the activity log, marked "restated by a later 4/A, not counted", and counted once.
- **02 Known affiliations**: each company this person files for, with the roles stated in their latest Form 4 there ("Role not shown here; it is stated in the latest Form 4" when it was not looked up), plus other issuers SEC EDGAR lists for the same CIK that Insidir has not imported.
- **03 Activity log**: every imported line in plain words, newest trade first, 25 at a time; a joint filing (several reporting owners) says who it was filed with.
- **04 Filed records**: the Form 4 filings behind the file, with the original documents on SEC EDGAR.
- **States**: no file for that CIK (404, with the API's reason and the EDGAR link), a malformed CIK, the engine unavailable (Try again), and signed out or unpaid (401 and 402 go to sign in and subscribe with `next=` set to the file, so the reader comes back to it).

Every page that names a person with a known CIK links to the file: the overview, people, a company report's insiders, a filing's reporting owners, the research desk, the header search, the portfolio and manual holdings.

## Identity tiles

Every person and every company named on a product page shows a real picture taken from the internet: the company's logo, the person's headshot, or for a person with no published photo, their company's logo standing in. Nothing is generated: no avatar or favicon services, no drawn faces, no stand-in artwork.

- Logos come from the company's own website and logo services (stockanalysis, Wikipedia/Wikidata, companiesmarketcap, FMP, EODHD, nvstly); headshots from Wikimedia Commons, the company's own leadership pages and SEC proxy statements (DEF 14A), matched to the SEC reporting owner by CIK with a proven tie to the company.
- The engine resolves and re-hosts them; a page asks for all of its tiles in one `GET /v1/media` batch through `entity-media.js` and loads only content-addressed images from this origin (`/v1/media/<sha256>.<ext>`).
- Initials appear only when both a photo and a logo are confirmed absent (or the engine cannot be reached and nothing curated exists). Photo credits are listed in each page's credits footnote.

The details (fallback chain, retry schedule, tile states, credits and checks) are under [Logos and headshots](#logos-and-headshots).

## Structure

```
web/
  assets/css/base.css     design tokens, type, buttons, forms, navigation, motion primitives
  assets/css/app.css      product UI: panels, tables, tabs, segmented controls, charts
  assets/css/<page>.css   page layout
  assets/css/v13-halftone.css   the V13 identity: tokens and shared primitives (loaded last on every page)
  assets/css/v13-<family>.css   per-family V13 layout detail (home, app, desk, auth, static, company, notfound)
  assets/js/v13-halftone.js     halftone dot engine (the landing wordmark and every dot field) and the footer's back-to-top
  assets/js/v13-motion.js the scroll reveal on public pages (moves nothing else); see Motion: still content, live dots
  assets/js/motion.js     legacy scroll animation engine (declarative data attributes); no page loads it
  assets/js/site.js       mobile menu, accordions, toasts
  assets/js/app.js        product header, charts, sparklines, monogram avatars, API helper
  assets/js/entity-media.js  identity tiles: real logos and headshots from one /v1/media batch
  assets/js/form4-words.js   Form 4 wording and exact figures shared by the overview and the personnel file
  assets/js/<page>.js     page behaviour
  assets/fonts/           Inter, JetBrains Mono and Source Serif 4 (variable, latin + latin-ext, SIL OFL)
  assets/img/             photography
  assets/icons/           favicon and company marks
```

## Legacy motion system (not loaded)

No page loads `motion.js` any more (the alerts page was the last; see [Motion](#motion-still-content-live-dots) for how the site moves now). It is kept for reference: it reads data attributes, so pages declared their animation in markup:

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

### Logos and headshots

Every person and every company named on a product page (overview, people, personnel files, companies, filings, a filing, watchlist, research desk, alerts, portfolio, company report) gets an identity tile with a real picture taken from the internet. Nothing is generated: no avatar or favicon services, no drawn faces.

- **Where the pictures come from.** `web/assets/js/entity-media.js` (`window.InsidirMedia`) asks the engine's batch endpoint once per page: `GET /v1/media?tickers=…&people=<ownerCik>:<TICKER>,…&ciks=…` (contract in `docs/ENGINE.md` and `src/media-batch.mjs`). A person at an issuer with no ticker is asked as `<ownerCik>:cik:<issuerCik>` (the engine answers that issuer's logo as `logos["cik:<issuerCik>"]` to stand in, and looks for the photo at that issuer), and a person with no known issuer as `<ownerCik>` alone (answered from the person-photo record, with no new job); pending pairs are listed in `pending.photos` in the form they were asked. An older engine that does not accept those forms lists them as `invalid` (or answers 400 when nothing else was asked), and the tile steps down the chain for that visit. The engine resolves company logos from stockanalysis, Wikipedia/Wikidata, companiesmarketcap, FMP, EODHD, nvstly and the company's own site, and headshots matched to SEC reporting owners (by owner CIK, with a proven tie to the company) from Wikimedia Commons, the company's leadership pages and SEC proxy statements. Every image is re-hosted on this origin at `/v1/media/<sha256>.<ext>`; the helper refuses any other `src` in an answer. A small curated set (11 brand marks, 4 Commons portraits) is used only when the engine has nothing or cannot be reached.
- **Fallback chain.** Person: engine headshot → curated Commons portrait → the owner's own logo (a listed company filing as an owner) or the issuer's logo standing in (by ticker, or by issuer CIK when the row has none: `portrait(name, ticker, size, {cik, issuerCik})`) → curated mark → initials. Company: engine logo by ticker (by issuer CIK when no ticker was reported) → curated mark → initials. Initials appear only when every lookup came back empty, and their title says which lookups were possible ("no published photo or company logo found", "no published photo found", or "not available right now" while the engine cannot be reached).
- **Loading.** Tiles ask only when they come within 600px of the viewport; calls within 30 ms (at most 150 ms) share one request, split at 60 tickers / 100 people. Keys the engine lists as `pending` are asked again at 2, 4, 8, 15, 30 and then every 60 s for about six minutes (paused while the tab is hidden). The engine's `retryAfter` is the hint for its slowest pending kind (8 s for a running photo job, 15 s for one that waits its turn); headshots follow `retryAfterPhotos` (else `retryAfter`) and logos `retryAfterLogos` when the engine sends it, otherwise the 2/4/8 s schedule, so a cold logo is never held back by the photo queue. A headshot whose company job has not started yet (listed in the answer's `queued`, as `"<ownerCik>:<TICKER>"`) waits its turn without using that schedule up: it is asked every 15–60 s while it stays queued, and no key is asked again more than about 15 minutes after its first pending answer. While a headshot resolves, the company's logo is asked for at the same time and stands in as soon as it is known; until then the tile shows a still field of halftone dots. Answers are kept in memory and in `sessionStorage` (`ins-media:v2`: pictures 12 h, "none" 1 h), so the next page renders final tiles with no request. An image that fails to load drops its answer and is asked for once more, then the tile steps down the chain. If the endpoint answers 401–404 (a preview without the engine, signed out, unpaid) the page uses the curated set and initials for that visit. A 5xx or network error is asked again after 30 s and once more after 2 minutes; after a third failure the page keeps the curated set and initials for the visit (a browser that comes back `online` tries once more).
- **Tiles never move anything.** A tile is a fixed box (`--ins-size`, set per place by the page stylesheets); its states (`.is-loading`, `.is-photo`, `.is-logo`, `.is-stand-in`, `.is-monogram`) swap only its classes and its one `<img>`'s `src`, so no nodes are added and the motion layer never rescans for a picture. The picture fills the tile's content box exactly (one grid cell, `grid-template: 100%/100%`), also on the pages that still load the legacy `v5-media.css`, whose absolute positioning the V13 layer undoes. Headshots are cropped to fill (`object-fit: cover`); logos and stand-ins are contained with a 14% margin (6% for wide wordmarks). Everything prints in the site's grayscale. A picture that arrives after first paint fades in where it stands (`ins-land`, animating `opacity` only); nothing moves, and under reduced motion it simply appears.
- **Accessibility.** A tile beside the name it pictures is `aria-hidden` with `alt=""`; `{label:true}` makes it `role="img"` with a label such as "Apple logo (no published photo of Tim Cook)". Tiles hold no links.
- **Credits.** A `[data-media-credits]` footnote on each page lists every photo shown: the name, the credit and licence as the source gives them, and a link to the Wikimedia Commons file page or the SEC filing (a photo from a company's own site names the site, without a link). It ends "Shown in grayscale. Logos are trademarks of their owners." The footnote never moves what follows it: its space is held from the start (the height it had at this width on the last visit, kept in `sessionStorage` `ins-media-credits:v1`, or one line, two on a narrow screen), and new text goes in only while it is off screen (below the fold, or scrolled past, where scroll anchoring keeps the page still). Text that arrives while the reader is looking at it waits until it scrolls away; a page too short to scroll takes it at once without giving space back.
- **API.** `logo(ticker, size, {cik, name, label})`, `portrait(name, ticker, size, {cik, issuerCik, label})`, `company({…})`, `person({…})` return tile markup (final markup when the answer is cached); `hydrate(root)` binds tiles after a page sets `innerHTML` (tiles added without it are bound anyway); `logoFor(ticker, {cik})` / `photoFor(cik, ticker, {issuerCik})` are Promises for pages that draw their own frames (the company report's header, avatars and picker); `credits()`, `ready(root)` (for checks) and `refresh()`.
- **Check.** `node scripts/media-check.mjs` opens every product page at 390px and 1440px with `/v1` mocked (fixture images are drawn with sharp inside the run and never shipped) and checks each tile against the fallback chain, that each picture fills its tile (the `<img>` box equals the tile's content box within 1px), one request on load, sizes, sharpness (2×, from the `<img>`'s own box), accessibility, credits, the 503 and image-404 failure modes, `sessionStorage` reuse, reduced motion, a cold logo while a photo job waits (`retryAfter` 15), the credits footnote with the reader at the bottom of the page when the pictures land, and a person at an issuer with no ticker (`filing-private`). The company report's header logo is drawn at no more than half its stored size, so wide wordmarks stay at least 2× sharp.

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

The company page calls `/v1/intelligence`, `/v1/market/chart`, `/v1/company/profile`, `/v1/company/insiders`, `/v1/company/news`, `/v1/company/photos` and the `/v1/media` batch (header logo, and the logo standing in for people with no published photo) in parallel and renders each section as its data arrives. Every value is sourced: SEC EDGAR/XBRL for financials, filings and Form 4 activity; Yahoo Finance for delayed prices; Wikidata/Wikipedia for founding year, employees, website, logo, leadership photos and the description. Calculated values (market cap = price × shares outstanding, enterprise value = market cap + debt − cash and short-term investments, P/E = price ÷ trailing diluted EPS) explain their inputs in a tooltip and are skipped for foreign issuers whose listed shares may be ADRs. Logos are prepared on the server (see docs/ENGINE.md): the real mark sits directly on the page background with no tile or box, and a company without a verifiable logo shows no logo rather than a stand-in. People show a verified photo (Wikimedia Commons, the company's own site or an SEC proxy statement, credited on hover) or, with no published photo, the company's own logo standing in (initials only when neither exists); each name opens that person's file. The page checks back while photo sources finish: every 15–30 s while the company's photo job waits its turn behind others (without using up its schedule), and never for more than about 15 minutes.

## Before launch

- Product screens use clearly labelled sample data. Connect them to the engine's endpoints (`/v1/filings`, `/v1/transactions`, `/v1/companies`, `/v1/me/watchlist`, `/v1/me/alerts`) before presenting them as live.
- The Terms and Privacy pages describe how the engine currently works, but counsel must review them before public sign-ups are enabled (`ALLOW_SIGNUP=1`).
- Political-disclosure features appear in the marketing copy, but the engine keeps those sources disabled until licensing is cleared (see `docs/ENGINE.md`).

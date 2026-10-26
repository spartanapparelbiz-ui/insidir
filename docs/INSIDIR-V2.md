# Insidir V2: Follow the big money

Insidir shows the biggest bets and trades the second they happen, in plain English. This brief overrides
docs/BRIEF.md where they conflict. Billing, Whop, auth and pricing stay as they are.

Code comments cite sections of this file as `docs/INSIDIR-V2.md §N`.

## §0 Scope change (October 26, 2026)

- Launch with three tabs: **Sports, Markets and Stocks**. Crypto stays Coming soon.
- Stocks reuses the old stock engine on `codex/social-stock-funnel`, ported to TypeScript into the same moves table and card style (lib/stocks):
  - SEC Form 4 insider trades (from src/sec.mjs, src/insiders.mjs, src/sec-directory.mjs; sql/015, 019, 022, 023).
  - Big fund holdings, Form 13F (from src/form13f.mjs).
- Not ported, and staying off:
  - Congress trades: src/house-disclosures.mjs (`INSIDIR_HOUSE_DISCLOSURES_APPROVED=0`, per docs/ATTORNEY-REVIEW.md on that branch).
  - The Bluesky monitor.
- SEC requests use the User-Agent in `SEC_USER_AGENT` and stay under 10 a second.
- Same V2 rules for Stocks:
  - real data only
  - the 20-move accuracy check covers Stocks too
  - anything not ready wears the Coming soon badge

## §1 Product

- Tabs: Sports, Markets, Stocks (see §0). Crypto shows "Coming soon" with a waitlist.
- Price gaps (the old scanner) is a Pro extra, off unless enabled; `LADDERS_ENABLED=0`.
- Pricing: Free / Insidir $1 for 3 days then $39/mo ("Recommended") / Pro $99/mo. No founder plan.
- Company line: "Insidir is built by Aethric LLC, Pompano Beach, FL." Support: hello@aethric.llc. No Telegram anywhere.

## §2 Coming soon rule

- A feature is ready only when all of these hold:
  - it works end to end on production with real data
  - it passes its tests
  - it passes the accuracy check (§12)

  Anything else gets a Coming soon badge.
- A Coming soon item is visible but can't be used:
  - It wears a violet tint pill (#F1EEFF background, #4A3AF0 text) reading "Coming soon".
  - Tapping it opens a sheet: "Coming soon. Want a heads-up when it's live?"
  - The sheet has an email field. The email is saved to the `waitlist` table with the feature name.
- Pricing bullets mark unready features "(coming soon)".
- When a feature goes live:
  - remove its badge in the same deploy
  - email its waitlist "[Feature] is live on Insidir." (`npm run notify:waitlist <feature>`)
- No half-working features, dead links or empty pages.
- Readiness is set per deploy with `FEATURES_READY`, a comma list of feed, records, follows, alerts_push, alerts_email, daily_email, custom_rules, price_gaps and stocks. Crypto is never ready yet.

## §3 Data rules

**Polymarket**
- Data API: `/trades` (filterType=CASH), `/positions`, `/activity`, closed positions.
- A move is one wallet putting ≥ `WHALE_MIN_POLY` ($10k) into one outcome.
- That wallet's fills in the same market within 10 minutes merge into one move.

**Kalshi**
- Public `GET /markets/trades` with min_ts and cursor, about every 15 s.
- It shares the 10 req/s budget with the scanner, and trade polling gets priority.
- A move is one trade ≥ `WHALE_MIN_KALSHI` ($5k).

**Noise to skip**
- Prices above 97¢ or below 3¢.
- Wallets buying both sides of a market within an hour.
- Wallets with more than 300 trades a day.

**Storage**
- Moves are stored in `moves`, and each is marked won or lost when its market settles.

**Trader records**
- Shown only with 20+ resolved markets.
- "Top trader" needs 20+ resolved markets and positive all-time profit; otherwise it's "a wallet".
- Show the public name or pseudonym, or a short address (0x12…ab). Never identify who is behind a wallet.

**Stocks: insider buys (Form 4)**
- Source: EDGAR's current-filings feed, polled every 2 minutes. Each filing is read once (`sec_seen`).
- A card is an open-market purchase (code P, acquired) of non-derivative stock, summed per filing, of $100,000 or more.
- Value is shares × the reported price, exact to the cent. Nothing is estimated.
- Amendments (4/A) are not shown.
- The card names the filed relationship (the CEO, a director, a 10% owner), not the person.

**Stocks: big fund adds (13F)**
- Source: each tracked fund's (`INSIDIR_13F_MANAGER_CIKS`) latest 13F-HR compared with its previous 13F-HR, checked every 6 hours.
- A card is added shares × this quarter's reported value per share of $25M or more. A new position counts in full.
- Share positions only (no options).
- Only filings whose table adds up to the cover page's totals are used.

**Every stock card**
- Links to the SEC filing itself.
- Is dated when the filing became public.

## §4 Copy rules

- Prediction markets:
  - "A top trader just put $412,000 on the Chiefs to win."
  - "Pays $161 on every $100 if the Chiefs win."
  - "Won 41 of 63 · +$1.2M all-time"
  - "2 min ago"
- Stocks:
  - Insider buy: "The CEO of [Company] just bought $1.4M of [Company] stock."
  - Fund add: "[Fund] added $250M of [Company] last quarter."
  - Fund add filing line: "Filed Nov 14 for the quarter ending Sep 30. 13F data can be up to 45 days old."
- Banned words: arb, arbitrage, orderbook, liquidity, spread, bid, ask, odds, implied probability, contracts, sharp, insider info, lock, guaranteed, risk-free, free money, sure thing.
- Never "buy this" or "copy this bet".

## §5 Location rules

- Ask once, the first time someone taps a market link: "Where are you? US / Outside US". Show the answer as a pill. Never block the feed.
- US users:
  - see all moves
  - never get international Polymarket links, and never see any VPN mention
  - get "See it on Kalshi" when the matching engine finds the same market, otherwise no trade link
- Non-US users get the source link.
- SEC filing links go to sec.gov for everyone.

## §6 Pages

**Landing**
- Trial bar.
- Nav: How it works, Pricing, FAQ, Log in, "Try it for $1".
- Hero:
  - "Follow the big money."
  - "See the live feed" and "Try it for $1".
  - "$1 for 3 days, then $39/mo. Cancel anytime."
  - The biggest real move of the last 24 hours.
- Tab strip.
- How it works.
- Results: "Real past moves. Not a promise."
- Pricing.
- FAQ.
- Dark band.
- Footer disclaimer.

**Feed** (`/feed`; `/terminal` redirects here)
- Tabs, size chips and league chips.
- Cards.
- Status line: "Live · updated 8s ago" or "Catching up. Showing the latest moves we have."
- Empty state.
- Free viewers see moves 30 minutes late, with the upsell card. Records are hidden and Follow is locked.

**Other pages**
- `/trader/[wallet]`, `/market/[id]`, Following, Results.
- `/gaps` (Pro, with a preview).
- Pricing.
- After payment, the welcome card.
- Account, auth screens, 404.

## §7 Alerts and content

**Alerts**
- Web push and email for every move by a followed trader, and every $50k+ move in a followed market.
- Pro adds custom rules.

**Daily email**
- At 8am ET: the top 5 moves, plus how yesterday's top-trader moves settled.

**Share card**
- `/api/share/[moveId]`: a 1080×1920 PNG.

**`/admin/posts`**
- Behind `POSTS_ADMIN_EMAILS`.
- Shows the top 10 moves of the last 24 hours, each with Download and a caption.

## §8 Plans (gating)

- Free: 30 minutes late, no records, no follows, no alerts.
- Insidir: live, records, up to 50 follows, push and email alerts, daily email.
- Pro: custom rules, unlimited follows, Price gaps.

## §10 Design

**Tokens**
- Backgrounds and borders: #FFFFFF, #F6F7FB, #E6E8EF.
- Text #0B0B12, muted #5B6070.
- Violet #5B4BFF (hover #4A3AF0, tint #F1EEFF).
- Money #087A55 (tint #E8F8F1). Loss #C2410C.
- One dark section, #0B0B12.

**Type**
- Plus Jakarta Sans only.
- Headlines 800 at -0.03em, body 500, buttons 700.
- tabular-nums for money.

**Layout**
- Cards: 16px radius and the soft shadow.
- Pill buttons, primary 52px.
- Tap targets ≥ 44px.
- 8px scale, max width 1200px.
- Phone first.

## §12 Checks before a step is done

- All tests pass.
- Screenshots of every page at 390×844 and 1440×900, with 2 review rounds.
- Lighthouse on landing and feed: Performance 90+, Accessibility 95+.
- Production verification.
- The 20-move accuracy check (`npm run check:moves`): 20 random prediction-market moves and 20 random Stocks moves, each re-read from the source (Polymarket, Kalshi, SEC EDGAR).

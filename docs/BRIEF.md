# Insidir: Master Experience Brief

Implement in the phases at the bottom. After every phase: run the tests, take screenshots, commit, and report. This
brief overrides any earlier design or copy instructions where they conflict.

## 0. The one thing to get right

A first-time visitor from Instagram, on an iPhone, should feel this within 5 seconds:

> "Two apps priced the same thing differently. Someone could buy both sides and keep the difference. This site finds those, right now, and it's real."

Every page, component and line of copy either makes that feeling stronger or gets cut.

## 1. Product truth

**What Insidir is:** a live scanner that finds price gaps between Kalshi and Polymarket (and impossible prices inside
one app). It shows exactly what to buy on each side and what you keep after fees.

**What Insidir is not** (say this plainly when it matters):

- Not predictions or picks. Just math on two prices.
- Never holds money, never trades for anyone, never asks for exchange API keys.
- Not risk-free: prices move, fills aren't guaranteed, and rules can differ. That's why every deal shows "Same rules?"

**Pricing (final):**

- **Free:** deals shown 30 minutes late, top 3 only, sizes blurred.
- **Insidir:** $1 for 3 days, then $39/mo. Full live feed, alerts within 60 seconds, calculator, walkthroughs, receipts.
- **Insidir Pro:** $99/mo. Instant alerts, whale tracker, P&L, full history, Pro view.
- No founder plan. No other offers.

**Company:** Insidir is built by Aethric LLC, Pompano Beach, FL. Support: hello@aethric.llc, replies within 24 hours.

### Who we're designing for

- **Side-income Sam (primary).** 22–40, on IG and TikTok daily, has $300–$3,000 to put to work, has heard of
  Polymarket or Kalshi, isn't a trader. Wants steady small wins and to feel smart. Fears scams and looking dumb.
- **The regular.** Already trades prediction markets weekly. Wants speed, density and accuracy. Will pay for Pro if
  it's faster than checking both apps.
- **The skeptic.** Thinks "free money" means scam. Converts only after seeing receipts, losses included, and the
  honest FAQ.

Design defaults to Sam. The regular gets Pro view. The skeptic gets Receipts, the trust stack and the FAQ.

## 2. Non-negotiables

### Honesty

- Every number on the site comes from the database. Log the query behind each stat. If a value is missing, zero or
  too small to be meaningful, hide the element. Never show placeholders.
- No fake timers, fake "spots left," fake viewers, fake wins, fake testimonials, AI-generated people presented as
  customers, borrowed press logos, or Kalshi/Polymarket logos.
- Never use the words "guaranteed," "risk-free" or "free money." Use "locks in a profit if both sides fill and both
  apps settle the same way."
- Losses and misses appear in Receipts with the same visual weight as wins.

### Legal guardrails

- Region setting at signup. US users only see venues legally available to them (Kalshi, Polymarket US). Never show or
  link the international Polymarket site to US users. Never mention VPNs.
- No advice tailored to a person's positions or situation. The calculator only does math on an amount the user
  types. P&L shows the user's own data only, with no suggestions.
- Footer on every page: "Information only, not financial advice. Not affiliated with Polymarket or Kalshi. Prices
  move and fills aren't guaranteed. Check that prediction markets are available where you live."
- Affiliate links (if ever added) are disclosed next to the link.

**Data states.** Every live surface handles four states, each designed (see section 9): live, quiet (no deals right
now), stale (last data older than freshness limit), paused (upstream failure).

## 3. Visual system

### 3.1 Color tokens

| Token | Hex | Use |
|---|---|---|
| Ink | #000000 | Dark page background |
| Surface | #141414 | Rows, cards, inputs on dark |
| Surface-2 | #1C1C1C | Hover, raised elements on dark |
| Line | #262626 | Dividers on dark, only where needed |
| Paper | #F5F5F2 | Light section background; primary text on dark |
| Ink-text | #0A0A0A | Primary text on light sections |
| Steel | #8C9099 | Secondary text |
| Dim | #5A5F66 | Timestamps, stale or closed items |
| Violet | #8B7CFF | The only accent: primary CTA, live pulse, "You keep" segment, links, focus rings, active states |
| Violet-press | #7A6AF0 | Pressed state of violet |
| Safe | #30D158 | "Same rules: Yes" only |
| Check | #FF9F0A | "Same rules: Check" only |
| Stop | #FF453A | "Same rules: No" and error text only |

Rules: violet covers under 5% of any screen. Safety colors appear only inside safety badges and errors. Profit
numbers are white (dark) or near-black (light), bold. Color is never the only signal.

### 3.2 Type

- JetBrains Mono (tabular figures on): all prices, numbers, the $1 bar labels, Terminal data, stat values.
- General Sans (Fontshare): headlines, body, buttons, labels.
- Scale (px): 13 / 15 / 17 / 20 / 24 / 32 / 44 / 60 / 84 / 120. Nothing in between.
- Body 17px mobile, 18px desktop, line-height 1.5, max line length 66 characters.
- Headlines: General Sans 600, tracking -2% at 44px+, line-height 1.05.
- Hero prices: JetBrains Mono 700, 72px mobile, 120px desktop.
- Sentence case everywhere. No all-caps labels. No eyebrow labels above headings.

### 3.3 Space, shape, depth

- 8px grid. Section padding: 96px desktop / 64px mobile. Max content width 1200px; reading width 680px.
- Radius: 0 on the hero split and the $1 bar ends; 12px on cards and rows; 10px on inputs; full pill on buttons and
  badges.
- No drop shadows on dark. Depth comes from Surface vs Ink. On light sections, one shadow token only:
  `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06)`.
- Film grain: a CSS noise overlay on dark sections at 2% opacity, static (not animated), disabled for reduced
  transparency.

### 3.4 Section rhythm (landing)

Dark → dark → light (Receipts ledger) → dark → light (FAQ) → dark footer. Light sections should feel like a printed
bank statement: crisp, calm, credible.

### 3.5 Iconography and illustration

- Custom inline SVG, 1.5px stroke, round caps, 24px grid. Monochrome (Paper on dark, Ink-text on light), violet only
  for the active part of an icon.
- Illustrations only for "how it works" and empty states: simple line art of two app screens, a tap, a $1 payout. No
  people, no 3D, no gradients.

### 3.6 Motion system

- Durations: 120ms (press/hover), 200ms (small state change), 320ms (panels/sheets), 900ms (the hero sequence only).
- Easing: `cubic-bezier(.2,.8,.2,1)` for enters, `cubic-bezier(.4,0,1,1)` for exits.
- One signature moment: the hero sequence on load (section 5.1). No other on-scroll entrance animations.
- Live-data motion (allowed everywhere): digit roll on number change with a 600ms violet glow fade; new rows slide in
  200ms; closed rows dim then collapse.
- prefers-reduced-motion: show final states instantly; keep the live updates without movement.

## 4. Signature components (build these first, use them everywhere)

1. **The $1 bar.** A horizontal bar representing $1.00, split into: [side A price] [side B price] [the gap]. The gap
   is violet with the label "You keep", and a thin hatched slice inside it shows fees. Sizes: hero (full width,
   animated), card (compact, static), inline (tiny, in rows). Accessible label: "Spend 95 cents, get 1 dollar back,
   keep 4.6 cents after fees."
2. **Price ticket.** A neutral "app card" showing venue name in text, the outcome (YES/NO), and the live price in
   JetBrains Mono. Never styled like Kalshi or Polymarket.
3. **Deal card (Simple view).** Event + time, the play as a sentence, the $1 bar (compact), "You keep $X at $Y",
   "Same rules?" badge, "Works up to $Z", "Pays out in …", "Open for 3m 12s", and a "Show me how" button.
4. **Deal row (Pro view).** Table row: Same rules | Event | The play | You keep | Return | Works up to | Pays out | Open
   for. Right-aligned mono numbers, fixed decimals.
5. **Walkthrough.** 3 steps for a specific deal with the user's own amount: buy side A (button opens that app), buy
   side B (button), done (what happens at payout). Live prices; if a price moves, the step updates and says so.
6. **Same rules? badge.** Icon + word: Yes (check), Check (alert), No (x). Tap opens both rule texts side by side
   with differences highlighted.
7. **Live heartbeat.** Violet pulse dot + "Scanning live. Last scan 2s ago." In stale/paused states it turns Steel
   and says what happened.
8. **Stat block.** Big mono number + one plain line. Hidden below its meaningful threshold.
9. **"What you could have kept" slider.** "If you'd put [$100 … $5,000] into every green deal last week, you'd have
   kept $X after fees." Uses only deals that were fillable at that size. Footnote: "Based on last week's real deals.
   Past results don't guarantee future ones."
10. **Missed-deals panel (free users).** "{n} deals closed before you could see them this week. At $500 each, that
    was $X after fees."
11. **Ledger table (Receipts).** Audited-statement styling on Paper.
12. **Upgrade bar.** One persistent, dismissible-per-session bar for free users with the single most relevant line
    (see copy deck).
13. **Toast.** Real events only, max 1 per 10s, max 4 per visit, auto-hide 5s.
14. **Device frames.** iPhone and laptop frames that render the real live components (not screenshots) for the
    landing page.
15. **Reel.** Muted autoplay loops (MP4/WebM, under 1MB each, poster frame, lazy) of real Terminal moments recorded
    with Playwright.
16. **Share card.** A generated image (OG-sized and 9:16 story-sized) of a closed receipt: event, both prices, "You
    keep $X at $500", lasted Y min, "insidir.com". Used for social sharing and by me for content.

## 5. Page by page

### 5.1 Landing (/)

Header: logo, Terminal, Receipts, Pricing, Log in. Right side: live heartbeat (small). Mobile: logo + heartbeat +
menu; sticky bottom CTA bar appears after first scroll.

1. **Hero (dark, above the fold at 390x844)**
   - Headline (A/B): A "Two apps. Two prices. You keep the difference." B "Get paid when Kalshi and Polymarket
     disagree."
   - The split: price ticket left, price ticket right, the $1 bar between them.
   - Signature sequence (900ms): tickets slide in from opposite edges with live prices counting up → their segments
     fill the $1 bar from both ends → the violet gap appears → "You keep $4.60 at $100" lands.
   - Data fallback order: live green deal → most recent real deal ("Last deal: … closed 2h ago") → closest live
     matched market ("Not a deal yet: 101¢ in") → paused (last known prices, greyed, "Last updated …"). Never empty.
   - Sub: "Every day these two apps misprice the same events. The gaps close in minutes. Insidir finds them every few
     seconds."
   - CTA: violet button "See today's live deals". Under it: "Free to look. No signup." Secondary link: "Try
     everything for $1".
   - Trust row: "We never touch your money" / "Every deal is public in Receipts" / "Cancel in one click" / "Payments
     by Whop".
2. **The flow (dark)** "We find the gap. You take both sides. You keep the difference." Three beats, each with its
   component: the scanner heartbeat over a market list → the walkthrough with two "Open" buttons → the $1 bar with
   "You keep".
3. **Live right now (dark)**
   - Stat row: "{markets} markets scanned live" / "{deals_today} deals today" (falls back to week) / "{median_life}
     min median deal life".
   - The live tape: latest real events sliding by ("New deal … 3.4%", "Closed … lasted 4m", "Big bet $48K on NO …").
   - The phone frame showing the real Simple-view feed, paid fields blurred for logged-out users, "Unlock" on each
     card.
4. **What you could have kept (dark)** The slider (component 9), big. Under it: "Members saw every one of these the
   second it appeared."
5. **Receipts (LIGHT)** Heading: "Every deal we've flagged. Wins and misses." The last 7 days as a ledger (top 8
   rows), the 7-day summary line, and the cumulative line chart. Button: "See the full log".
6. **Same rules? (dark)** Heading: "We read the fine print so you don't get burned." Three badges with one line each,
   plus a real example of a "No" that was hidden from the feed and why.
7. **How Insidir makes money (dark, short)** "Only from subscriptions. We don't take a cut of your trades, and the
   apps don't pay us." (Must stay literally true.)
8. **Pricing (dark)** Heading: "The gaps don't wait. Pick how fast you see them." Three cards (section 5.5). Under
   them: "Not a prediction. Just math." / "We never touch your money." / "Cancel in one click." Next to the trial:
   "Last week's green deals at $500 each = $X kept."
9. **FAQ (LIGHT)** (copy in section 6.3)
10. **Final CTA (dark)** If a deal is live: "There's a deal live right now." Otherwise: "The next gap could show up any
    minute." Button: "See it".

Footer (dark): company line, hello@aethric.llc, "Replies within 24 hours", links (Terminal, Receipts, Pricing, About,
FAQ, Privacy, Terms), the legal footer.

### 5.2 Terminal (/terminal)

- Top bar: heartbeat, today's totals, Simple/Pro toggle (remembered), filters (category, min "You keep", min size,
  Same rules), sort (pays out soonest / most kept / newest; default: best "kept per day").
- Member momentum line: "This month: {taken} deals taken, ${kept} kept." Fed by "I took this" taps and the connected
  Polymarket wallet.
- Simple view (default): deal cards. Pro view: deal rows, compact density toggle, keyboard (J/K, Enter, Esc, /).
- Free users: same layout, 30-minute delay, paid cells blurred (values not in the DOM), upgrade bar: "You're seeing
  deals 30 min late. {n} closed before you could see them today."
- Live behavior: new deals slide in with a violet glow on "You keep"; "Open for" counts up; closed deals dim, show
  "Closed. Lasted 4m 08s.", then collapse.
- Tab title: "(3) Insidir Terminal" with the live green count.
- Empty state: illustration + "No green deals right now. They usually show up every {median_gap} min." Button: "Turn
  on alerts".

### 5.3 Deal detail (drawer on desktop, bottom sheet on mobile; also /deal/[id])

- Header: event, time, Same rules badge, "Open for".
- Amount input (big, number keyboard): "How much do you want to put in?" → contracts per side, cost per side, fees,
  payout, You keep, return, pays out date.
- The $1 bar at the user's amount.
- Walkthrough (component 5) with "Open Kalshi" / "Open Polymarket".
- Live 30-minute gap sparkline.
- Both rule texts side by side, differences highlighted.
- "I took this" button (logs to their momentum; optional amount).
- If the deal closes while open: banner "This deal just closed." Numbers freeze and grey out.
- Share button → share card (component 16) once the deal is closed.

### 5.4 Receipts (/receipts, light page)

- Tabs: 7 days / 30 days / All time.
- Summary row: deals flagged, settled, "$500 per green deal" result after fees, how often both sides settled the same
  way, median deal life.
- Cumulative line chart (one line, no fill, hover tooltips, labeled axes) and "How long deals last" histogram.
  Heatmap "When deals show up" (hour × weekday).
- Ledger table: Receipt ID | Found at (exact time) | Event | Prices at detection | Works up to | You keep at $500 |
  Settled | Same rules held? Losses and misses shown plainly.
- Row expand: order book snapshot at detection, both rule texts, how each side settled, links to both markets, share
  card.
- Export CSV. Filters by result, category, date.

### 5.5 Pricing (/pricing)

- Cards:
  - Free: "$0. See deals 30 minutes late." Button: "See today's live deals"
  - Insidir: "$1 for 3 days, then $39/mo." Bullets: every live deal, alerts within a minute, the calculator and
    walkthroughs, full receipts. Button: "Try it for $1"
  - Insidir Pro: "$99/mo. For active traders." Bullets: alerts in seconds, whale tracker, your real P&L, full
    history, Pro view. Button: "Go Pro"
- Anchor line: "Other arbitrage tools charge around $200/mo."
- "How the $1 trial works" in one line: "Pay $1 today. Full access for 3 days. Then $39/mo. Cancel before day 3 and
  you won't be charged again. We'll email you the day before."
- Checkout: Whop embedded Checkout element on the same page (fallback: hosted checkout link). Shows "$1.00 due today"
  and "$39.00 after 3 days" from Whop.

### 5.6 After payment

Land directly on the Terminal with a one-time banner: "You're in. Here's what's live right now." Then onboarding.

### 5.7 Onboarding (first paid session, 3 steps, skippable, never shown twice)

1. "What do you want to see?" Category chips (sports, politics, economics, crypto, culture). Region confirmation.
2. "Turn on alerts so you never miss one." Push permission; on iPhone, the Add to Home Screen guide first. Test alert
   button.
3. "Here's your first deal." Opens the best live deal's walkthrough (or the most recent one, labeled as closed, as a
   tutorial).

### 5.8 Alerts (/alerts)

On/off, triggers (min "You keep", categories, Same rules level), quiet hours, "Send test alert", last 20 alerts with
outcomes. Pro shows instant; Insidir shows "within 60 seconds".

### 5.9 Account (/account)

Groups: Alerts, Filters, Region, Billing, Account. Autosave with "Saved". Billing: plan, next charge date and amount,
"Manage billing" (Whop), one-click cancel, trial end date if trialing.

### 5.10 About (/about)

What Insidir is, why it exists, how deals are checked (matching, Same rules, freshness), what we'll never do (hold
money, trade for you, sell your data), who's behind it (Aethric LLC, Pompano Beach, FL), contact.

### 5.11 FAQ, Privacy, Terms

FAQ copy in section 6.3. Privacy and Terms readable, with a plain-English summary box at the top of each.

### 5.12 404 and errors

404: "This page doesn't exist." Buttons: Terminal, Home. Errors always say what happened and what to do.

### 5.13 Emails (Resend; plain, fast, mobile-first; from hello@aethric.llc)

- Trial started: "You're in for 3 days. Here's how to take your first deal." One button.
- Day 2 reminder (required): "Your trial ends tomorrow. You'll be charged $39 on {date}. Cancel anytime in one click:
  {link}." Also handle Whop's membership.trial_ending_soon.
- Weekly recap (members): "Your week: {n} green deals showed up, you took {m}, kept ${x}. Biggest one: ${y}."
- Weekly recap (free): "This week {n} deals closed before you could see them. At $500 each: ${x}."
- Payment failed: includes Whop's recovery_url.
- Alert email (backup to push): one deal, the $1 bar as an image, "Open the walkthrough".

### 5.14 PWA

Installable (manifest, icons from the "i" mark, service worker). Push via VAPID. Offline page: "You're offline. Live
deals need a connection."

## 6. Copy

### 6.1 Voice

Confident, short, plain. Imperatives for actions ("Find the gap." "Take both sides." "Keep the difference."). Grade 6
reading level in Simple view. The same action keeps the same name everywhere.

Plain-word swaps: arbitrage → price gap; ROI → return; profit after fees → you keep; max size → works up to; per day
→ pays out in; safety light → same rules?

Banned in headlines and CTAs: guaranteed, risk-free, free money, may, could potentially, helps you, unlock your
potential, revolutionary, AI-powered.

### 6.2 Microcopy

- Upgrade bar (free): "You're seeing deals 30 min late. {n} closed before you could see them today." Button: "Try it
  for $1"
- Alerts prompt: "Turn on alerts so you don't miss the next one."
- Stale deal: "This one's probably gone. Prices moved {n} min ago."
- Paused: "Live data paused. Retrying now."
- Saved: "Saved."
- Took it: "Nice. Added to your month."

### 6.3 FAQ

- **Is this risk-free?** No. Prices can move before both sides fill, and in rare cases the two apps settle the same
  question differently. That's why every deal shows "Same rules?" and why we only show amounts you can actually fill.
- **Do you trade for me?** No. Insidir shows you the deal. You buy on each app yourself. We never touch your money.
- **How much can I make?** Most deals return {median}% to {p90}%. The money comes from taking many of them. Receipts
  shows real results, misses included.
- **Do I need a lot of money?** No minimum. Small amounts make small profits, so most people start with a few hundred
  dollars.
- **How does the $1 trial work?** You pay $1 today and get full access for 3 days. Then it's $39/mo. Cancel before day
  3 and you won't be charged again. We email you the day before.
- **Can I use Polymarket where I live?** It depends on where you are. US members only see deals on apps available in
  the US.
- **What's a price gap?** When buying YES on one app plus NO on the other costs less than $1. One side always pays $1,
  so you keep the difference.
- **How do you make money?** Only from subscriptions.
- **How do I cancel?** One click in Account. No emails, no calls.

## 7. Motivation system (real, not manufactured)

- The "aha" in under 60 seconds: hero shows a real deal and what you'd keep → "See today's live deals" → the free
  feed with real deals → "Show me how" on one → the walkthrough with their own amount. No signup needed until they
  try to see live data.
- Stakes: "Open for" timers, "closed before you could see it", the missed-deals panel and weekly free recap. All real.
- Progress: "This month: {taken} taken, ${kept} kept", milestones as quiet badges ("First deal taken", "First $100
  kept", "10 deals taken"), weekly member recap.
- The habit loop: alert → open deal → walkthrough → "I took this" → kept counter goes up → weekly recap.
- Proof: Receipts everywhere, share cards for closed deals, and (later) opted-in member results with real handles.

## 8. Conversion architecture

| Stage | Goal | Primary CTA |
|---|---|---|
| Landing | Understand + believe | See today's live deals |
| Free feed | Feel the delay | Try it for $1 |
| Deal walkthrough (free) | See exactly how | Try it for $1 |
| Pricing | Choose | Try it for $1 |
| Trial | First deal + alerts on | Turn on alerts |
| Day 2 | Keep | (honest reminder) |

Objection → answer → where it lives:

- "Is this a scam?" → Receipts with losses, company + email, Payments by Whop, How we make money → hero trust row,
  footer, About.
- "Is it legal for me?" → Region setting + FAQ → onboarding, FAQ.
- "Will I lose money?" → Same rules?, honest FAQ, works-up-to sizes → deal detail, FAQ.
- "Is it worth $39?" → the slider + "last week at $500 each" → landing, pricing.
- "Can I cancel?" → "Cancel in one click" everywhere → pricing, trust row, account.

## 9. Data integrity and states

- Freshness limit: deals older than 20s without a confirming price update show as stale. Feed paused if no scan in
  60s.
- State matrix per surface (hero, stat row, tape, feed, detail, receipts): design and screenshot live, quiet, stale,
  paused, free, paid.
- Every stat has a minimum threshold before it's shown (e.g. deals all-time ≥ 100, median life needs ≥ 20 settled
  deals).
- Free users: paid values are never sent to the browser.

## 10. Analytics and experiments

Events: landing_view, hero_variant, cta_click(location), feed_view, deal_open, walkthrough_open, amount_entered,
unlock_click, pricing_view, checkout_start, trial_started, paid, alert_enabled, i_took_this, share_card_created,
cancel. UTM preserved through checkout (one tagged link per IG/TikTok/YouTube account).

Admin funnel page: conversion between each stage, by source and by A/B variant.

First experiments (one at a time, run to significance):

1. Hero headline A vs B.
2. Slider placement: section 4 vs directly under the hero.
3. Primary CTA: "See today's live deals" vs "Show me a live deal".

## 11. Performance, accessibility, SEO, sharing

- Landing: under 1MB first load, LCP under 2s on 4G, Lighthouse mobile Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95.
- Accessibility: visible focus, contrast ≥ 4.5:1, 44px targets, labels on every icon button, charts with text
  summaries, reduced motion respected.
- SEO: unique titles and descriptions; FAQ schema; a dynamic OG image on / showing the current hero deal, and on
  /receipts/[id] showing that receipt's share card.

## 12. Implementation phases (each ends with tests, screenshots, commit, report)

1. **Foundations:** tokens, fonts, grain, motion utilities, and all 16 signature components in a /dev/components
   gallery page (every state). Screenshot the gallery.
2. **Landing:** sections 1–10, all data fallbacks, the signature hero sequence, A/B harness.
3. **Terminal + deal detail:** Simple and Pro views, walkthrough, "I took this", free vs paid, live behaviors,
   keyboard.
4. **Receipts + pricing + checkout:** ledger, charts, CSV, share cards, Whop checkout with $1/3-day trial,
   after-payment landing.
5. **Onboarding, alerts, account, about, FAQ, legal, 404, emails, PWA.**
6. **Motivation and growth:** slider, missed-deals panel, momentum line, milestones, weekly emails, OG images.
7. **QA:**
   - Playwright at 390x844 and 1440x900: full journey (landing → free feed → walkthrough → $1 trial checkout →
     onboarding → alert test → I took this → cancel), every data state, every empty and error state, keyboard
     navigation, free users' network responses contain no paid values.
   - Unit tests for every calculation that reaches the UI (the slider math must equal the receipts math).
   - Lighthouse and axe on every main page.
   - Screenshots of every page and state to /qa/screenshots/final, then two rounds of self-critique against this
     brief: remove anything decorative, generic, untrue or confusing.
   - Final report: pass/fail per item, anything not done and why, and the before/after screenshots.

# Landing page v2: section order, copy and wireframe (for approval before building)

Audience: a phone, inside Instagram's in-app browser, never heard of a Form 4, 5 seconds.
Rules from the two briefs: one action (search, then "Start for $1"); every section is one headline, one sentence,
one visual; no eyebrow labels, no dot-separated meta lines; real data only (server-rendered from our database), no
"not live data" labels; 7th-grade reading level; "Research, not investment advice." stays.

Today's page has 9 sections (hero, layers, intelligence system, product in motion, four capabilities, one platform,
the questions, sources, plan, final) and two vague CTAs ("Explore Insidir", "View the platform"). The new page has 8.

## Section order

| # | Section | Headline | The one sentence | The one visual |
| --- | --- | --- | --- | --- |
| 1 | Hero | See when CEOs buy and sell their own stock. | Insiders have to report every trade to the SEC. Insidir reads every filing and tells you what it means in plain English, minutes after it posts. | Search box + live trade strip; on desktop an iPhone frame with the real /NVDA page beside it |
| 2 | Live this week | This week's biggest insider buys. | Insiders are CEOs, CFOs, directors and big shareholders, and these are the largest buys they reported this week, straight from SEC EDGAR. | Two live counters + top 5 real trade cards, each linked to its filing |
| 3 | How it works | Three steps. No finance degree needed. | Pick your stocks, we read every filing, and you get one sentence when an insider trades. | Tabs with real product screens: 1 Pick your stocks · 2 We read every filing · 3 You get one-sentence alerts |
| 4 | Receipts | What happened after they bought. | Every insider buy over $1M by two or more insiders at one company in the last 6 months, and what the stock did 30 and 90 days later, including the ones that went down. | Table of receipts (fixed rule, all rows shown) + the free weekly email form under it |
| 5 | Comparison | Built for one job: following insiders. | Here is how Insidir compares with the tools people use today, checked on their public pages as of [date]. | Comparison table |
| 6 | Pricing | $1 for 7 days. Then $29 a month, for life. | The first 100 subscribers keep the founding price forever; after that it is $39 a month. | Pricing card with monthly/annual toggle and seats-left count |
| 7 | FAQ | Questions people ask first. | Short answers, with the full terms one tap away. | Accordion (6 questions) |
| 8 | Final CTA | Search any stock. See who's buying. | It takes ten seconds and you don't need an account. | Search box again + founder note (photo, Nicholas, 3 sentences) |

Removed: the 9 "layers", "The intelligence system", "Product in motion", "Four capabilities", "One platform, every
depth", "The questions worth $39 a month", "Original sources" (its one real filing link moves into section 2's
sentence). Connections, Changes, Autopilot, Evidence and Intelligence become the three tabs of section 3:
Pick = Autopilot (watchlist + follow), Read = Changes + Evidence + Connections (the plain sentence, the filing,
the roles), Alert = Intelligence (the alert as it arrives).

## All copy

### Nav
`insidir.` · Platform · Pricing · FAQ · Log in · **Start for $1**
Phone: `insidir.` · **Start for $1**

### 1. Hero
- H1: **See when CEOs buy and sell their own stock.**
  A/B variant: **The people running your stocks have to tell on themselves. We tell you first.**
- Sub: Insiders have to report every trade to the SEC. Insidir reads every filing and tells you what it means in
  plain English, minutes after it posts.
- Search: placeholder `Type a stock: NVDA, TSLA, PEP` · button **See insiders**
- Under it: $1 for 7 days. Cancel online anytime.
- Live strip (server-rendered, newest first, auto-scrolls, pauses on touch and under reduced motion):
  `PEP · Director bought $1.2M · 14 min ago` (format: `TICKER · Role bought|sold $X · N min ago`; links to /TICKER)

### 2. Live this week
- Counters: **Filings read today** `1,284` · **Insider trades tracked this month** `18,906` (real counts from
  sec_filings / sec_transactions; numbers count up once)
- Five trade cards. Card: `NVDA` · Jane Doe, Director · **Bought $2.4M** · Oct 16, 2026 · View filing ↗
- Under the cards: Data straight from SEC EDGAR. See a real filing ↗ (the top card's Form 4)

### 3. How it works
- Tab 1 **Pick your stocks.** Type a ticker or paste a list. Follow a CEO by name. (real watchlist component)
- Tab 2 **We read every filing.** "Robert Pohlad, a director, bought $23.7M of PepsiCo stock with his own money."
  Every number links to the filing. (real Changes card with the Evidence row)
- Tab 3 **You get one sentence.** Push or email, minutes after the filing posts. (real alert)

### 4. Receipts
- Rule (fixed, printed above the table): Every open-market buy over $1M where two or more insiders at the same
  company bought within 10 days, in the last 6 months. All of them, up or down.
- Columns: Stock · Who bought · Amount · Date · 30 days later · 90 days later · Filing
- Row: `PEP` · 2 directors · $3.1M · Apr 2, 2026 · +4.1% · −2.3% · Form 4 ↗
- Under the table: Past results don't predict future ones. Research, not investment advice.
- Email form: **Get the 5 biggest insider buys every week. Free.** [email] **Send it to me** · One email a
  week. Unsubscribe in one click.

### 5. Comparison (competitor cells are filled only from their public pages, with the date checked)
| | Insidir | Unusual Whales | OpenInsider | SEC EDGAR yourself |
| --- | --- | --- | --- | --- |
| Plain-English explanation of each trade | Yes | to verify | to verify | No |
| Alerts minutes after a filing | Yes | to verify | to verify | No (RSS only) |
| Every number linked to its filing | Yes | to verify | to verify | It is the filing |
| Built for phones | Yes | to verify | to verify | No |
| Insider track record (hit rate) | Yes | to verify | to verify | No |
| Price | $1 for 7 days, then $29/mo | to verify ($50/mo per the brief) | to verify | Free |
Footnote: Competitor details from their public pages as of [date]. Tell us if something changed.

### 6. Pricing
- Toggle: Monthly · Annual (2 months free)
- Card: **Founding price** · **$29** / month, locked for life · `63 of 100 founding seats left` (from Stripe)
  Annual: **$290** / year
- Included: Every insider trade in plain English · Alerts minutes after filing · Track record for every insider ·
  Unlimited watchlist and follows · Every number linked to the SEC filing
- Button: **Start for $1**
- Under the button: $1 today. We email you before you're charged. Cancel in 2 clicks.
- Anchor: Unusual Whales is $50/mo. (only after verification)
- After 100 seats: $39/month · $390/year (same layout, no founding line)

### 7. FAQ
1. **What is an insider?** CEOs, CFOs, directors and anyone who owns more than 10% of a company. The law makes
   them report their trades to the SEC within two business days.
2. **Is this legal to use?** Yes. These are public records. Insidir reads them faster and explains them.
3. **What do I get for $1?** Everything, for 7 days. On day 6 we email you before the $39 (or founding $29) charge.
4. **How do I cancel?** Billing → Cancel. Two clicks, online, any time.
5. **Do you tell me what to buy?** No. Insidir shows what insiders did. Research, not investment advice.
6. **Where does the data come from?** SEC EDGAR, the government's filing system. Every number links to its filing.

### 8. Final CTA
- H2: **Search any stock. See who's buying.**
- Sentence: It takes ten seconds and you don't need an account.
- Search box (same component as the hero)
- Founder note: [photo] **Nicholas, founder.** "I kept missing the one signal that is actually public: the people
  who run a company buying its stock with their own money. The filings were there, written for lawyers. I built
  Insidir to read them for me, and now for you." (draft: replace with your own words)

### Footer (3 columns)
Product: Search a stock · Pricing · How it works · Data sources
Company: About · Terms · Privacy · Subscription policy
Account: Log in · Help (hello@aethric.llc)
`insidir.` © 2026 Aethric LLC · Research, not advice.

### Sticky bar (phones, after the hero scrolls away)
**Start for $1** · 7 days, cancel anytime

## Wireframes

Phone, 390 × 844 (the hero fits without scrolling):
```
┌──────────────────────────────┐
│ insidir.          [Start $1] │  56px sticky nav
├──────────────────────────────┤
│                              │
│  See when CEOs buy           │  H1 42/46
│  and sell their own          │
│  stock.                      │
│                              │
│  Insiders have to report     │  body 16/26, muted
│  every trade to the SEC...   │
│                              │
│ ┌──────────────────┬───────┐ │
│ │ Type a stock: NVDA│ See   │ │  56px search
│ └──────────────────┴───────┘ │
│  $1 for 7 days. Cancel       │  small 14/20
│  online anytime.             │
│                              │
│ PEP · Director bought $1.2M ›│  live strip, 1 row visible,
│ NVDA · CFO sold $4.0M  ›     │  slides
└──────────────────────────────┘
```
Desktop, 1440 (centered hero, iPhone frame with the real /NVDA page and the live feed beside it):
```
            insidir.   Platform  Pricing  FAQ          Log in  [Start for $1]

                 See when CEOs buy and sell their own stock.          H1 72/76
          Insiders have to report every trade to the SEC. Insidir...  body 18/28
                [ Type a stock: NVDA, TSLA, PEP       | See insiders ]
                      $1 for 7 days. Cancel online anytime.

            ┌──────────┐    LIVE FILINGS
            │  iPhone  │    PEP  Director bought $1.2M     14 min ago
            │  /NVDA   │    NVDA CFO sold $4.0M            22 min ago
            │  page    │    ... new rows slide in
            └──────────┘
```
Every section after the hero, left-aligned:
```
  H2 (44/50, balanced)
  One sentence (18/28, max 640px)
  [ one visual, max 1160px, 14px radius, 1px hairline ]
```

## Decisions I need from you before building

1. **Price change.** Founding $29/mo for the first 100, $290/yr, then $39/mo ($390/yr?) needs new Stripe Prices
   (live mode). You asked me not to touch live Stripe without asking. OK to create them in test mode now and give
   you the exact live-mode steps? The trial emails and terms I changed today say $39; they would change too.
2. **Founder photo.** I need the image file (and your approval of the note's wording).
3. **Competitor cells.** unusualwhales.com and openinsider.com are unreachable from this build environment. I'll
   leave those cells marked "to verify" and hidden in production until verified; or you paste their pricing pages.
4. **Sign-in.** There is no Google sign-in and no Clerk in the repo today (email + password). Your flow asks for
   email-code sign-in with no passwords. I'll add email-code sign-in and attach `ref` to the Insidir account and
   the Stripe customer (no Clerk). OK?
5. **Ticker URLs.** Public pages already exist at /insider-trading/NVDA (server-rendered, indexable). I'll serve
   them at /NVDA too, with /NVDA canonical, and trim the free view to 3 trades + the blurred rest.
6. **Instagram testing.** I can emulate Instagram's in-app browser (its user agent, viewport, no Google) in
   Chromium here, but not on a real iPhone or Android. A real-device pass needs you or a device lab.

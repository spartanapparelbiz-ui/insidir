# UX walk-through scores

Walked as: a first-time visitor from Instagram on an iPhone (Instagram's in-app browser user agent), a signed-in
free user, and a paying Pro user, at 390x844 and 1440x900 (qa/ux-walk.ts; evidence per visit in
qa/screenshots/ux-before/walk.json). Scores 1–5: Purpose (clear in 3 seconds) / Next step (one obvious action) /
Speed / Readability / Trust.

## Before

| Page | Purpose | Next step | Speed | Read | Trust | Why it lost points |
|---|---|---|---|---|---|---|
| Home `/` | 5 | 3 | 4 | 4 | 4 | 4–5 primary (white) buttons compete; 13,000px tall on a phone; footer text fails contrast (3.3:1); font loads from a third-party host |
| Terminal | 3 | 3 | 4 | 3 | 4 | Heading says "Deals", not what the page is; card rows, not a table; decimals differ per row (2.0% vs 9.5%); Unlock on every row plus a banner button; Pro sees no next step |
| Deal page | 4 | 2 | 4 | 3 | 2 | Free: profit, size, per-day and fees cells render empty (the lock style isn't loaded on this page), which looks broken; two primary buttons with different names for one action ("Unlock sizes and profit", "Start Insidir for $39 a month") |
| Receipts | 4 | 3 | 4 | 4 | 4 | Reads as a list, not an audited ledger; no summary, chart, export or filters |
| Pricing | 5 | 4 | 4 | 5 | 4 | Fine; contrast fail in footer; "Start for $39" vs elsewhere "Unlock" for the same action |
| Settings | 4 | 3 | 4 | 3 | 3 | One long form with a manual "Save settings" and a second primary ("Turn on push alerts"); 18–21 tap targets under 24px (checkboxes, chips); billing shows no next charge or Manage billing |
| Alerts | 1 | 1 | 1 | 1 | 1 | Doesn't exist (404); alert settings are buried in Settings; no test alert, quiet hours or history |
| P&L | 4 | 4 | 4 | 4 | 4 | Upsell card is fine; Pro empty state needs a clear first step |
| Whales | 4 | 2 | 4 | 4 | 4 | Empty state has no button ("check back later") |
| Terms / Privacy | 5 | 3 | 5 | 4 | 4 | No way onward except the header; footer contrast |
| Admin | 4 | 4 | 4 | 4 | 4 | Internal; contrast |
| 404 | 1 | 1 | 5 | 2 | 1 | Next.js default: white page, off-brand, no links back |

Site-wide: the header differs by who you are (no Pricing; Whales/P&L/Settings crowd the phone header), there's no
bottom tab bar for members, buttons have no loading/success states, nothing confirms an action ("Saved"), the
same action has three names, and the Dim grey fails contrast as small text.

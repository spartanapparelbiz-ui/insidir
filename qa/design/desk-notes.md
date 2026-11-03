# The Desk: what the references actually do

Captured 2026-11-03 with Playwright at 1440×900 (screenshots in `qa/design/refs/`). Numbers are computed styles of
every visible text element above the fold (`getComputedStyle`), plus measurements taken off the screenshots.

**Network:** Polymarket, Robinhood, Linear and Vercel loaded. Kalshi returned a Vercel security checkpoint (HTTP 429)
for every automated request, so the Kalshi notes come from what I know of the product, not from a capture. The Vercel
*dashboard* needs a login; I measured vercel.com (same Geist system, same team) and note where the dashboard differs.

## What I measured

| | Polymarket event | Robinhood stock | Linear | Vercel | Kalshi (from memory) |
|---|---|---|---|---|---|
| Type sizes in use | 12, 13, 14, 16, 28, 40 (14 dominates) | 13, 15, 24, 32 | 12, 13, 15, 20, 64 | 14, 16, 18, 20, 24, 64 | 12, 14, 16, 24, ~44 for the % |
| Weights | 400 / 500 / 600 (600 for names and numbers) | 400 / 500 / 700 | 400 / 510 / 590 | 400 / 450 / 500 | 400 / 500 / 600 |
| Line height | 16–20 for 12–14px; 28 for 28px (1.0 on big numbers) | 40 on 32 (1.25), 20 on 13 | 14 on 12, 19.5 on 13, 64 on 64 (1.0) | 20 on 14, 32 on 20 | tight on numbers, ~1.4 on text |
| Tracking | −0.09 to −0.42px; −1px on the 40px figure | −0.33px on 32px | −1.4px on 64px, −0.17px on 13px | −3.84px on 64px | negative on numbers |
| Families | Inter (1); a mono only once, for a code chip | Capsule Sans Display + Text | Inter Variable | Geist Sans | one sans |
| Row height | ~73px per outcome row, 1px divider between rows, no card per row | n/a (stats as a 2-column list with dividers) | ~32–36px list rows | n/a | ~56–64px market rows, dividers |
| Dividers | 1px, very low contrast (≈ #1f2328 on #15191d); full width of the column | 1px #2a2f33 under sections; none inside the chart | 1px rgba(255,255,255,.05–.08) | 1px #1f1f1f | 1px hairlines |
| Surfaces | 2: page bg, and the trade panel | 2: black page, #1e2124 order panel | 2: #08090a page, a hair-lighter panel | 2: black, #0a0a0a | 2: bg and the market card |
| Colours (non-grey) | green + red for Yes/No buttons only; one red/blue per chart series | ONE accent (orange #ff5000) used for up/down move, chart line and the primary button | one indigo for the primary button | one blue link | green / red, one brand accent |
| Filled buttons per view | many (every row has Buy Yes / Buy No; it's a trading terminal) | 1 filled (Sign Up to Buy) + 2 outline | 1 filled (indigo) | 0–1 | 1 per market (Buy) |
| Chart | thin 1.5px lines, no fill, faint dotted horizontal guides at 10/20/30%, axis labels 12px grey at right | ONE 1.5px line, NO gridlines, one dotted baseline (previous close), no axis labels, timeframe tabs below in 13px caps | n/a | n/a | thin line, current % labelled at the end of the line, few guides |

## What to take from each

- **Kalshi:** the probability is the hero. A market shows one big number (the % / ¢) in large tabular figures, the
  question in medium weight, and a single Buy action. Everything else is small grey text.
- **Polymarket:** rows, not cards. One divider between rows, no box around each. Each row is name (16/600) over a grey
  meta line (14/400), then a big number (28/600) in its own column. Real candidate portraits at 40px rounded
  squares next to names. The chart is a few thin lines with almost no guides; the legend is plain coloured text.
- **Robinhood:** a stock page is: name (24–32), price (32, weight 500, −0.33px tracking), move today in the accent colour,
  then ONE line chart with no grid and a dotted reference line, then timeframe tabs. One accent colour does all of the
  "this is up/down" work. One filled button.
- **Linear / Vercel:** dark UI craft is restraint: 12–15px body, weights 400–590 (never bold 700 for UI), hairlines at
  5–8% white, two greys for text (≈ #d0d6e0 primary, #8a8f98 secondary), negative tracking on large type, no shadows,
  no gradients on surfaces, hierarchy from size and grey value.
- **Sellix hero spec (ours):** black stage, Plus Jakarta Sans, white pills, masked line rises; one white pill per view.

## Rules for the Desk, derived from the above

1. Scale: 12 / 14 / 16 / 20 / 28 / 44 / 72. Body 14. Meta 12–14 grey. Names 16/600. Big numbers 28–72 at weight 600,
   tracking −0.02em to −0.04em, line height 1.0.
2. Two text greys: #fff and rgba(255,255,255,.56). No third.
3. Two surfaces: #000 page and nothing else, or #000 + one #0b0b0b panel for the action column. No card in a card.
4. Rows: 64–72px, 1px #1a1a1a divider between rows, nothing around a row.
5. Colour only with meaning: green up, red down, violet #a78bfa for live/focus, flat gold #F2C35B for one small $1M+
   marker. Never a gradient.
6. One chart: 1.5px white line, no gridlines, one dotted reference line at their average entry, gold dots where the
   millionaires bought, the current price labelled at the right end. No fill (or a 6% fill at most).
7. One white pill per view.
8. No monospace. Tabular figures via `font-variant-numeric: tabular-nums` on Plus Jakarta Sans.
9. Sentence-case labels at 12–14px grey. No ALL-CAPS letter-spaced headers.
10. Identity is text: short address + all-time profit. Teams and candidates as clean text; a verified portrait only
    where licensed (lib/brand/people.json), a small team-colour chip until a logo licence exists.

## Critique of the three directions (before posting)

Checked each against the banned list and the rules above, at 1440×900 and 390×844.

| Check | A Kalshi | B Front page | C Stage |
|---|---|---|---|
| Gradient text, glass, blur, orbs, sparkles, emoji | none | none | none |
| Cards in cards; border + bg + shadow per block | none: dividers only | none: rules and column dividers only | none: full-width stages split by dividers |
| Filled buttons per view | 1 (Copy at …) | 1 | 1 (the later stages use a text link) |
| Monospace / ALL-CAPS labels | none | none | none |
| Scenery photos, logo knockoffs | none: text wordmark, team names with a colour chip | none | none |
| Truncated market names | none: names wrap | none | none |
| "none", empty panels, stats reading 0 | none: a 0¢ move reads "flat"; KPIs only when non-zero | same | same |
| Type scale | 12/14/16/20/28/72 | 12/14/16/20/28/44 | 12/14/16/20/44/72 |
| Colour | green/red moves, violet live dot, one 6px gold marker per $1M+ wallet, team chips | same | same |

Fixed while critiquing:
- The table and the chart disagreed on the price (the venue's history ran past the price the rows show). The chart now
  stops at the moment the rows' price was read, so both show the same number and no point is invented.
- A white legacy footer showed under the preview; hidden like the brand pages.
- Dark team colours (the Pacers' navy) vanished on black; chips now carry a faint 1px outline.
- On phones, A's Copy pill fell below a tall chart; it now sits right under the price, and charts cap at 200px.
- B's right column said "Live" while the worker was paused; it says "Latest bets", with the violet dot only when live.
- A zero move printed "0¢"; it reads "flat".

Known in these captures:
- Status reads "Paused · Last bet 2h ago": the dev worker isn't running, so that's the honest state.
- No portrait appears: no live market names a person (every politics market is party-level), so none qualifies under
  the imagery rules. The pipeline (lib/brand/people.json, /credits, the test) is in place.

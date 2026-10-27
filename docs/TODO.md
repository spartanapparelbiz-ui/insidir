# TODO

## Kalshi ↔ Polymarket matcher (Price gaps and "See it on Kalshi" stay off until these are fixed)

Found by hand-checking 20 live deals on 2026-10-26: 10 were real, 10 paired different markets. Two of the four
causes are fixed: a vice-president market never pairs with a president market, and "reaches $X any time" never pairs
with "above $X at a set time" (`lib/matching/candidates.ts` hard conflicts). Still open:

- [ ] **Michelle Obama paired with Barack Obama.** `lib/matching/aliases.ts` lists "barack obama", "michelle obama" and
  "obama" under one person, `obama`, so "Will Michelle Obama be the Democratic nominee in 2028?" (Kalshi) matched
  "Will Barack Obama win the 2028 Democratic presidential nomination?" (Polymarket). Split them into two people and
  treat a bare "Obama" as ambiguous; add a test that the two never pair.
- [ ] **"Impeached" paired with "impeached and removed".** Kalshi "Will Trump be impeached and removed from office?"
  matched Polymarket "Will Trump be impeached before his term ends?". Impeachment alone does not remove a president,
  so YES on one and NO on the other can both lose. Make "removed / removal / convicted" a hard conflict against a
  market that only says "impeached"; add a test.

Before turning Price gaps or the US "See it on Kalshi" link back on (`GAPS_ENABLED=1`, `lib/moves/links.ts`):
fix both, re-run the 20-deal hand check, and confirm none of the pairs is wrong.

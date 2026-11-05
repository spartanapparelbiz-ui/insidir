# The rules backtest: following proven wallets on Kalshi

Computed on production 2026-11-05 01:34 UTC from `/api/record/rules` (lib/autopilot/report.ts). Live at /results.

## Verdict

**No rule is positive over 100+ settled bets.** By the rule we set (a rule leads only when it is positive over 100+ settled bets at Kalshi's ask + 1¢), Insidir leads with no record: /go, the paywall and the homepage show no return figure, and the old "$50 on every millionaire bet" line is gone. Following every proven-wallet bet loses 12.2% over 283 settled bets.

The only positive rows have too few bets to mean anything: "Big bets" (+3.7% over 63), "Bets of $50K+" (+3.4% over 67) and the 70–85¢ entry band (+2.2% over 36). None is reported as a winner.

## How it was measured

- **Bets:** every Polymarket bet of $5K+ by a proven wallet ($1M+ all-time profit and 30+ settled markets *at the time of the bet*, so no lookahead) in the last 180 days: 3,106 bets.
- **Price:** Kalshi's ask for that side at the moment Insidir saw the bet, from Kalshi's 1-minute candles (the last candle closed by then; a 60-minute candle if none), plus 1¢. 880 of the 3,106 bets (28%) have a Kalshi twin and a price; the rest are on markets Kalshi doesn't list and are left out and counted.
- **Stake and exit:** $25 a bet, held to settlement, losses included. No caps, so variants compare like for like.
- **Sell when they exit vs. hold to settlement:** not in the table. Insidir records exits only since Nov 2, too few to compare. Every row holds to settlement.

## Baseline

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| Every proven-wallet bet of $5K+ | 283 | 138 | 145 | −$856 | −12.2% | 0 | no |

## Starter rules

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| Big bets | 63 | 34 | 29 | +$58 | +3.7% | 4 | no |
| Two agree | 28 | 11 | 17 | −$203 | −29.3% | 3 | no |
| Tonight's games, first in | 106 | 50 | 56 | −$263 | −10.0% | 9 | no |

## Variants

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| 2+ proven wallets, same side, within 1h | 31 | 14 | 17 | −$185 | −24.1% | 0 | no |
| First entry only | 283 | 138 | 145 | −$856 | −12.2% | 0 | no |
| Bets of $50K+ | 67 | 37 | 30 | +$57 | +3.4% | 0 | no |
| First entry, 2+ wallets agree | 31 | 14 | 17 | −$185 | −24.1% | 0 | no |

## Too-late guard

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| Skip if Kalshi is 3¢+ above their price | 254 | 118 | 136 | −$889 | −14.1% | 29 | no |
| Skip if Kalshi is 5¢+ above their price | 258 | 122 | 136 | −$803 | −12.5% | 25 | no |
| Skip if Kalshi is 8¢+ above their price | 260 | 123 | 137 | −$821 | −12.7% | 23 | no |

## Entry price on Kalshi

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| Under 30¢ | 7 | 1 | 6 | −$85 | −49.0% | 0 | no |
| 30–50¢ | 62 | 27 | 35 | −$19 | −1.3% | 0 | no |
| 50–70¢ | 175 | 80 | 95 | −$751 | −17.3% | 0 | no |
| 70–85¢ | 36 | 28 | 8 | +$19 | +2.2% | 0 | no |
| 85¢ and up | 3 | 2 | 1 | −$19 | −26.5% | 0 | no |

## Category

| Rule | Settled | Won | Lost | Net on $25 a bet | Return | Too late (skipped) | Leads |
|---|---:|---:|---:|---:|---:|---:|---|
| football | 50 | 21 | 29 | −$322 | −26.0% | 0 | no |
| basketball | 181 | 92 | 89 | −$360 | −8.0% | 0 | no |
| soccer | 39 | 18 | 21 | −$168 | −17.3% | 0 | no |
| hockey | 13 | 7 | 6 | −$6 | −1.9% | 0 | no |

Categories with no settled bets on Kalshi (elections, politics, baseball, tennis, racing, esports and others) are left out of the category table.

## What this means

- Every rule with 100+ settled bets lost money on Kalshi over the last 180 days: every bet, first entry, tonight's games, the too-late guard at 3/5/8¢, the 50–70¢ band and basketball. Consensus (2+ wallets) lost 24% over 31. The three positive rows (bets of $50K+, Big bets, 70–85¢) have 36 to 67 settled bets, too few to lead.
- The 50–70¢ entry band holds most of the settled bets (175 of 283) and loses 17.3%.
- Insidir makes no return claim until a rule clears 100+ settled bets in profit. The report recomputes every 30 minutes; a rule that qualifies leads automatically with its real numbers.

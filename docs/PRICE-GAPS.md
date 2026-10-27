# Price gaps: cheap to run

Price gaps is a Pro extra. It stays off (`GAPS_ENABLED=0`) until a Pro customer exists. When on, it runs in two
parts, and neither one holds the whole market universe.

## 1. Matcher: a Railway cron job

The matcher is `npm run match` (scripts/match.ts → lib/gaps/matcher.ts). It runs every 6 hours (`railway.match.json`,
`17 */6 * * *`) and exits when done. Each run:

1. **Streams markets page by page.**
   - Kalshi: `/markets` with Kalshi's cursor, 1,000 per page.
   - Polymarket: `/events/keyset`, 100 events with their markets per page.
   - Polymarket US: one small list.
   - The activity floor (`SWEEP_MIN_VOLUME_USD`, `SWEEP_MIN_OPEN_INTEREST`) is applied per page. A page is dropped before the next one is read.
2. **Keeps the candidate index in Postgres**, in `match_keys`: each market's blocking keys and close day.
   - Only new markets, or markets whose matching fields changed (`matchFingerprint`), get new keys.
   - Markets that closed leave the index.
3. **Re-scores only Kalshi markets that can be affected.** These are:
   - new or changed Kalshi markets
   - Kalshi markets sharing a key with a Polymarket market that appeared, changed or closed

   The work is done in close-date order, 300 markets per batch. Each batch's candidates come from SQL. Each market's current candidates are stored in `match_candidates`.
4. **Decides every candidate.** A decision is deterministic, or made by the LLM within `MATCH_LLM_MONTHLY_USD` ($3 by default). Every decision is cached in `match_decisions`.
5. **Assigns pairs one-to-one.** It uses only current candidates with an accepted decision whose two markets are still open and unchanged.
   - Each pair gets a safety light and its rules mismatches (date, threshold, source, tie).
   - Admin overrides are applied.
   - `pairs` and `gap_targets` (pairs plus multi-outcome sets) are written in one transaction.

On the same markets, the database matcher's pairs equal the old in-memory matcher's: 720 of 720 at full size.
`scripts/check-match-equivalence.ts` checks this.

## 2. Live scanner: inside the existing worker

The live scanner is lib/gaps/live.ts. There is no new service.

- It re-reads `gap_targets` every 10 minutes and keeps only those targets' markets, without rules text.
- Every 10 seconds it books only those markets:
  - Kalshi: batch orderbooks, 100 tickers per request.
  - Polymarket: `POST /books`, 500 tokens per request.
- It then runs every engine.
- These deals are quarantined instead of shown:
  - deals that look too good (a return above 15%, or keeping more than $50 at $500)
  - deals from pairs whose rules differ in date, threshold, resolution source or how a tie settles

The matcher no longer runs in the worker, and neither does the full sweep. The moves feed now looks markets up on
demand, in the database first and then from the venue, keeping at most 5,000 entries. The worker's heap cap went from
4 GB to 512 MB.

## Matcher checks kept and added

- **Kept from `claude/kind-davinci-3plr2i`:**
  - quarantine
  - a tie that is its own outcome breaks an inverted pair
  - rules mismatches on pairs
  - ladders off
- **New: vice president vs president.** A vice-president market never pairs with a president market (`officeWords`).
- **New: at a set time vs any time.** "Reaches $X at any time" never pairs with "is above $X at 5pm / the close" (`measureOf`).

## Measurements

Measured with `scripts/bench-match.ts`, on synthetic venues at production size. Markets are generated page by page, the way the real clients deliver them. Postgres 16 is local and there is no network.

| | Result |
|---|---|
| Listed | 130,000 Kalshi + 230,000 Polymarket markets |
| Over the activity floor | 26,000 + 25,632 |
| Matcher, first run (everything new) | **63.5 s**, peak RSS **214 MB** (the Node + tsx baseline is ~110 MB) |
| Matcher, nothing changed | **4.8 s**, peak RSS 247 MB |
| Matcher, 1% of markets changed | **24.0 s**, peak RSS 251 MB; 6,500 markets re-scored |
| Targets | 720 pairs + 658 multi-outcome sets = 1,378 |
| Live scanner memory | **+14.6 MB** heap for 1,378 targets / 4,689 markets |
| Live scanner requests | 17 per 10-second round = **102 per minute** (Kalshi 100 tickers and Polymarket 500 tokens per request) |
| Postgres | markets 86 MB (synthetic rules text is empty; real rules add roughly 100 MB), match_decisions 61 MB, match_keys 22 MB, match_candidates 18 MB |

Real runs add network time:
- Kalshi: about 130 market pages plus about 150 event pages.
- Polymarket: about 460 event pages.

That is about 750 requests per run, and an estimated 5 to 6 minutes of wall time at the venues' rate limits. It has not been measured: this environment can't reach the venues.

## Estimated monthly Railway cost

Rates: $10 per GB-month of RAM, $20 per vCPU-month.

| Part | RAM | CPU | Total |
|---|---|---|---|
| Matcher | 0.25 GB × (4 runs × 6 min × 30 days = 12 h = 0.0167 month) = **$0.04** | Worst case, a full vCPU for the whole run: 0.0167 × $20 = **$0.33** | **≤ $0.37** |
| Live scanner (in the worker) | 0.015 GB × $10 = **$0.15** | About 0.15 s of CPU per 10 s round = 1.5% of a vCPU = **$0.30** | **≈ $0.45** |
| **Price gaps total** | | | **≈ $0.80 / month**, under the $3 target |

- **With `GAPS_ENABLED=0`:** the cron job starts, sees the switch and exits in a couple of seconds (about $0.01 a month), and the worker runs no gaps job.
- **LLM:** matching is capped separately at $3 a month on OpenRouter (`MATCH_LLM_MONTHLY_USD`).
- **Before:** the worker ran a full sweep and match every 5 minutes with a 4 GB heap. At 1 to 3 GB resident that alone was $10 to $30 a month in RAM.

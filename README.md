# Insidir Terminal

A live scanner for mispriced markets on Kalshi, Polymarket and Polymarket US. Pure math, no predictions: it looks
for sets of positions that pay $1 per set in every outcome for less than $1 after fees, and for prices that
disagree across venues.

Information only, not financial advice. Not affiliated with Polymarket or Kalshi.

## How it fits together

```
match (npm run match, Railway cron every 6 h, only with GAPS_ENABLED=1) ──► venues, page by page
   │  stream markets, index keys in Postgres, re-score only what changed, write pairs + gap_targets, exit
worker (npm run worker) ──► venues: Kalshi, Polymarket (Gamma, CLOB, Data API), Polymarket US, SEC EDGAR
   │  moves: big money moves (feed), alerts, daily email, settle, trader records
   │  gaps:  (GAPS_ENABLED=1) books for gap_targets every 10 s, every engine, quarantine, deals + receipts
   │  whales / settle
   ▼
Postgres (schema "terminal", Drizzle)
   ▲
web (Next.js App Router) ── /terminal, /deal/[id], /settings, /pnl, /whales, /receipts, /pricing, /admin
   └─ Whop for sign-in and billing; plan checked on the server; paid fields never sent to free users
```

| Path | What |
|---|---|
| `lib/fees.ts` | Kalshi and Polymarket taker fees (Kalshi rounds up to the cent) |
| `lib/engines/` | Cross-venue locks, multi-outcome sets (all YES / all NO), threshold ladders, implication rules, second opinions, whales, receipts |
| `lib/matching/` | Kalshi ↔ Polymarket matching: deterministic first, OpenRouter LLM only when unsure, every decision cached, safety lights |
| `lib/exchanges/` | Venue clients with rate-limit buckets, 429 back-off and "hot" priority for markets with live deals |
| `lib/scanner.ts` | Which books a scan needs, and every engine over them |
| `worker/index.ts` | The worker loop |
| `lib/feed.ts` | Plan and region filtering, done on the server (free: 30 min delay, top 3, sizes removed) |
| `config/implications.ts` | Curated "if A then B" rules |

## Local setup

```bash
npm install
cp .env.example .env.local          # fill in what you need; DATABASE_URL is enough to start
npm run db:migrate                  # creates schema "terminal" and its tables
npm run dev                         # web on http://localhost:3000
npm run worker                      # in a second terminal
```

Other scripts:

| Script | What |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Strict TypeScript |
| `npm run build` | Production build |
| `npm run scan` | One live scan without a database: top 10 deals with the math, pairs matched and their lights, false positives caught, rate-limit headroom, monthly cost (`--top N`, `--json`) |
| `npm run check:endpoints` | Calls every venue endpoint and fails loudly if a field the parsers rely on changed |
| `npm run db:generate` | New migration after editing `lib/db/schema.ts` |

## Environment variables

Every variable is listed with comments in [`.env.example`](.env.example). The ones that matter:

| Variable | Service | Needed for |
|---|---|---|
| `DATABASE_URL` | both | everything |
| `APP_URL` | both | Whop redirect, links in alerts and unsubscribe links |
| `WHOP_API_KEY`, `WHOP_COMPANY_ID` | web | reading memberships and payments, cancelling memberships |
| `WHOP_PLAN_INSIDIR`, `WHOP_PRODUCT_INSIDIR` | web | the one plan (Insidir, $39/month) the embedded checkout on `/start` sells |
| `WHOP_WEBHOOK_SECRET` | web | `/api/billing/webhook` signature check |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | both | web push (`npx web-push generate-vapid-keys`) |
| `WHOP_CLIENT_ID`, `WHOP_CLIENT_SECRET` (optional) | web | "Forgot password?": confirming it's the member through their Whop account (OAuth app, redirect URI `https://YOUR_DOMAIN/reset/callback`) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `MATCH_LLM_MONTHLY_USD` | match | LLM second check on unsure matches (optional, capped per month; default $3) |
| `ADMIN_TOKEN`, `ADMIN_TOTP_SECRET` | web | `/admin` (both required) |
| `KALSHI_API_URL`, `POLYMARKET_*_URL`, `POLYMARKET_US_ENABLED` | worker | venue endpoints |
| `*_RATE_PER_SEC` | worker | request budget per bucket |
| `GAPS_ENABLED` | worker + match | `1` turns Price gaps on (the cron matcher and the worker's live scanner); default off |
| `SWEEP_MIN_VOLUME_USD`, `SWEEP_MIN_OPEN_INTEREST` | match | activity floor: markets below it are not matched (default $100 24h volume on Polymarket, 100 open interest on Kalshi) |
| `ALERT_MS`, `WHALE_MS`, `SETTLE_MS` | worker | cadence |
| `LADDERS_ENABLED` | worker | `1` turns threshold ladders on; anything else (production: `0`) leaves them off |
| `FEATURES_READY` | web + worker | comma list of live V2 features (feed, records, follows, alerts_push, alerts_email, daily_email, custom_rules, price_gaps); anything missing shows "Coming soon" and its worker job stays off; add `stocks` once the Stocks accuracy check passes. Default `feed,records,follows` |
| `POSTS_ADMIN_EMAILS` | web | comma list of Whop account emails allowed to open `/admin/posts` |
| `BOOK_MIN_VOLUME_24H`, `BOOK_MAX_DAYS` | worker | which unmatched markets get order books (default 1000, 30 days) |
| `SEC_USER_AGENT` | worker | name and monitored email for SEC EDGAR requests (required for the Stocks tab's Form 4 and 13F jobs; under 10 requests a second) |
| `STOCKS_INGEST` | worker | `0` turns the Stocks jobs off (default on when `SEC_USER_AGENT` is set) |
| `INSIDIR_13F_MANAGER_CIKS` | worker | funds followed for 13F adds, comma-separated CIKs (default: six large managers) |

Kalshi API keys are never asked for or stored. P&L for Kalshi comes from the CSV export the user uploads, which
is processed and not stored.

## The worker

`npm run worker` runs these jobs. Each catches its own errors, so one venue being down pauses only that venue.

| Job | Every | What |
|---|---|---|
| gaps | 10 s | Only with `GAPS_ENABLED=1`. Re-reads `gap_targets` every 10 min; books only those markets (Kalshi batch orderbooks, 100 tickers per request; Polymarket `POST /books`, 500 tokens per request); runs every engine; quarantines deals that look too good or come from pairs whose rules differ; saves deals and receipts; marks deals inactive after 90 s unseen; a heartbeat per venue |
| alerts | 5 s | Members: push at once. Email backup for paid users without push (max 6 an hour) |
| digests | 10 min | Daily summary email at 13:00 UTC for users who opted in (the free plan's alert) |
| whales | 15 s | Polymarket trades over $10K |
| settle | 15 min | Record how each logged deal resolved, for the public receipts |

The site shows "Live data paused, retrying" when no venue heartbeat is newer than 2 minutes, "found X seconds
ago" on every deal, and greys out deals not re-seen in the last minute.

## Rate limits

Every request goes through a per-bucket token bucket set to about 80% of the published limit:

| Bucket | Default | Published |
|---|---|---|
| kalshi | 16/s | 20 reads/s (Basic tier) |
| polymarket_gamma | 24/s | /markets 300 per 10 s, /events 500 per 10 s |
| polymarket_clob | 40/s | /books 500 per 10 s (up to 500 tokens per call) |
| polymarket_data | 12/s | /positions 150 per 10 s, /trades 200 per 10 s |
| polymarket_us | 5/s | unknown (unverified API) |

On a 429 the bucket pauses for `Retry-After` (or an exponential back-off), retries, and logs it. "Hot" requests
(markets with a live deal) go ahead of the rest. The worker logs request counts, 429s and retries every minute;
`npm run scan` prints the same.

## Deploying on Railway

1. Create a project with a **Postgres** database.
2. Add a **web** service from this repo. `railway.json` sets the build (`npm run build`), the pre-deploy migration
   (`npm run db:migrate`), the start command and the `/api/health` health check. Attach your domain.
3. Price gaps only (when `GAPS_ENABLED=1`): add a **match** service from the same repo with the Railway config file
   `/railway.match.json`. It runs `npm run match` on the cron schedule `17 */6 * * *` and exits; nothing runs between
   runs. Set `DATABASE_URL`, `GAPS_ENABLED=1` and the matching variables on it.
4. Add a **worker** service from the same repo. In its Settings → Config-as-code, set the Railway config file to
   `/railway.worker.json` (start command `npm run worker`, no domain, no health check). Without this the worker
   service picks up `railway.json`, whose start command overrides the dashboard and runs the web app instead, so no
   scan runs and the site shows "Live data paused, retrying".
5. Set `DATABASE_URL` on every service (reference the Postgres service variable), and the variables above.
6. **Whop:**
   - One product, Insidir, with one plan: $39/month, no trial. Put its ids in `WHOP_PLAN_INSIDIR` and
     `WHOP_PRODUCT_INSIDIR`. The checkout is embedded on `/start`; no redirect URL or OAuth app is needed.
   - Add a webhook to `https://YOUR_DOMAIN/api/billing/webhook` with the events `membership.activated`,
     `membership.updated`, `payment.succeeded`, `payment.failed`, `refund.created`, `refund.updated` and
     `dispute.created`. Put its secret in `WHOP_WEBHOOK_SECRET`.
   - Apple Pay: `public/.well-known/apple-developer-merchantid-domain-association` is served as is; register the
     domain under Websites → Fix Apple Pay in Whop.
   - For "Forgot password?": an OAuth app with redirect URI `https://YOUR_DOMAIN/reset/callback`; its id in `WHOP_CLIENT_ID`.
   - Insidir sends no email: log-in is email and password (scrypt), and resets confirm through Whop.
6. **Network:** the worker must reach `api.elections.kalshi.com`, `gamma-api.polymarket.com`, `clob.polymarket.com`,
   `data-api.polymarket.com` (and `api.polymarket.us` if enabled), `openrouter.ai` and `api.resend.com`; the web
   service needs `api.whop.com` and `api.resend.com`.
7. After the first deploy, run `npm run check:endpoints` once (Railway shell) and fix anything it flags.

## Adding an implication rule

Rules live in [`config/implications.ts`](config/implications.ts); the file's header has the full steps. In short:

1. `antecedent.titlePattern`: an anchored RegExp with named groups, e.g. `(?<team>…)`.
2. `consequent.titlePattern`: regex source where `{team}` inserts the capture and `{team:map}` looks it up in
   `entityMap`.
3. Only add implications that hold in every outcome under both markets' rules. If there is any edge case, set
   `safety: "yellow"` and explain it in `safetyNotes`.
4. Add a test with synthetic markets in `test/engines-implication.test.ts`.

## Matching aliases

Team names, people, assets and other entities used by the matcher live in
[`lib/matching/aliases.ts`](lib/matching/aliases.ts). Add an alias when a real pair is missed; wrong matches can
also be fixed at once from `/admin` (match, block, or force a safety light).

## QA

| What | How |
|---|---|
| Unit tests | `npm test` (fees, arb math both ways, book walking, multi-outcome, ladders, implications, matching, paywall, alerts, the hand-checked 55¢ + 40¢ example) |
| End to end | `./qa/e2e/run.sh` builds a copy of the app with test settings and runs Playwright at 390×844 and 1440×900 against a seeded `terminal_e2e` database, a local mock of Whop (OAuth, memberships, signed webhooks, a test-mode checkout) and a stand-in push service. Needs local Postgres; create and migrate the database first (`DATABASE_URL=…/terminal_e2e npm run db:migrate`). |
| Lighthouse and axe | Start the e2e build (`npx next start -p 3100` in its folder), then `npx tsx qa/audit.ts`. Gates: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 (mobile); zero serious axe issues. Reports in `qa/reports/`. |
| iPhone push | By hand: [`qa/IPHONE-CHECKLIST.md`](qa/IPHONE-CHECKLIST.md) |
| Screenshots | Written by the e2e run to `qa/screenshots/<page>-390.png` and `-1440.png` |

## Copy rules

Never "guaranteed" or "risk-free". A lock is described as: "Locks in a profit if both sides fill and both markets
settle the same way." The footer disclaimer is on every page. `test/compliance.test.ts` checks every page's text.

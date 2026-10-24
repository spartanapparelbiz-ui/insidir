# Insidir operations runbook

How to configure, run and watch the parts added in the October 19, 2026 release: account security, email, alerts,
research events, explanations and operational monitoring. Billing basics, the SEC import and the public pages are in
[ENGINE.md](ENGINE.md); legal questions are in [ATTORNEY-REVIEW.md](ATTORNEY-REVIEW.md).

Nothing in this release switches on a regulated capability. `GET /v1/capabilities` must keep answering
`"mode":"RESEARCH_ONLY"`.

---

## 1. New environment variables

| Variable | Default | Meaning |
|---|---|---|
| `INSIDIR_ADMIN_TOKEN` | (falls back to `INSIDIR_CREATOR_ADMIN_TOKEN`) | Admin bearer token, 32+ random characters. |
| `INSIDIR_ADMIN_TOTP_SECRET` | empty | Base32 secret of the administrators' authenticator app. **Without it every admin route answers 503** (there is no single-factor admin access any more). Generate: `node -e 'import("./src/totp.mjs").then(m=>{const s=m.generateTotpSecret();console.log(s);console.log(m.otpauthUri(s))})'` and scan the `otpauth://` URI into the authenticator. Store the secret in the host's secret store only. |
| `INSIDIR_APP_SECRET` | empty | 32+ random characters. Signs one-click unsubscribe links. **Alert emails are not sent without it.** Changing it invalidates links already sent. |
| `INSIDIR_AI_EXPLANATIONS` | off | `1` lets the explanation service call Claude. Leave off until counsel has reviewed it (ATTORNEY-REVIEW.md, D-1). |
| `ANTHROPIC_API_KEY` | empty | API key for explanations (only read when `INSIDIR_AI_EXPLANATIONS=1`). |
| `INSIDIR_AI_MODEL` / `INSIDIR_AI_EFFORT` | none / `medium` | Model for research-event explanations; there is no default, and the service stays off until one is named. Choose an inexpensive model. |
| `INSIDIR_AI_EVENT_MAX_TOKENS` | `3000` | Output cap per research-event explanation (300-8000). |
| `INSIDIR_AI_PER_USER_DAILY` | `20` | Research-event explanations per member per day (on top of the shared limits below). |
| `INSIDIR_AI_INPUT_USD_PER_MTOK` / `INSIDIR_AI_OUTPUT_USD_PER_MTOK` | `4` / `20` | Prices used for that service's ledger and budget reservation (set them to the chosen model's list prices). |
| `INSIDIR_OPENROUTER_API_KEY` | empty | Key for the gateway (filing summaries, investigation synthesis). AI is off without it. |
| `INSIDIR_AI_MODEL_FAST` / `INSIDIR_AI_MODEL_DEEP` | `openai/gpt-4.1-nano` / `openai/gpt-4.1-mini` | Gateway models. Deep is an escalation for multi-company questions only. |
| `INSIDIR_AI_DAILY_BUDGET_USD` / `INSIDIR_AI_MONTHLY_BUDGET_USD` | `2` / `25` | Hard global budgets, across both AI paths and every instance (docs/COSTS.md). |
| `INSIDIR_AI_USER_MONTHLY_BUDGET_USD` / `INSIDIR_AI_USER_MONTHLY_LIMIT` | `0.25` / `300` | Per-customer monthly allowance and request cap. Cached text stays available past it. |
| `INSIDIR_AI_HOURLY_LIMIT` / `INSIDIR_AI_DAILY_LIMIT` | `40` / `300` | Global model calls per hour and per day. |
| `INSIDIR_AI_USER_HOURLY_LIMIT` / `INSIDIR_AI_USER_DAILY_LIMIT` | `12` / `40` | Per-customer model calls per hour and per day. |
| `INSIDIR_AI_ESCALATE_BELOW` | `0.5` | The deep model is used only while every applicable budget is below this share. |
| `INSIDIR_AI_MAX_INPUT_CHARS` / `INSIDIR_AI_MAX_OUTPUT_TOKENS` / `INSIDIR_AI_TIMEOUT_MS` / `INSIDIR_AI_RETRIES` | `12000` / `450` / `15000` / `1` | Per-request limits for the gateway. |
| `INSIDIR_BACKGROUND_WORKERS` | on | `0` runs no background job in this instance (a web-only replica). |

## 2. Admin access with MFA

1. Set `INSIDIR_ADMIN_TOKEN` and `INSIDIR_ADMIN_TOTP_SECRET`; restart.
2. Operations page: open `https://insidir.com/ops.html`, enter the token and the current 6-digit code. That opens a
   30-minute HttpOnly, SameSite=Strict session; the token is not stored by the page.
3. Scripts and curl (creator admin, `CREATORS.md`): send both headers on every request, a fresh code each time
   (a code is accepted once across every instance):
   `curl -H "Authorization: Bearer $TOKEN" -H "X-Insidir-Admin-OTP: 123456" https://insidir.com/v1/creators/admin/commissions`
4. Ten failed attempts from one address lock admin access for that address for 15 minutes. Every admin request,
   allowed or refused, is in `admin_audit_log`; failures are also in `security_events`.

## 3. Email: none

Insidir sends no email whatsoever: no sign-in codes, newsletter, alert emails or digests, trial reminders, receipts,
billing or security notices, password-reset links or checkout reminders. There is no email provider in the code
(`src/email.mjs` has no transport, and `INSIDIR_EMAIL_PROVIDER`, `POSTMARK_*` and `INSIDIR_EMAIL_*` are ignored).
Migration `028_no_email.sql` turned alert emails off for every member and cancelled everything left in
`email_outbox`. A member who forgets their password writes to hello@aethric.llc from their account address; reset it
by hand after confirming who they are. Stripe can send its own receipts if they are switched on in the Stripe
dashboard.

## 4. Background jobs

All run through `runWorker` (src/ops.mjs): one PostgreSQL advisory lock per job, so several instances never run the
same job at once; each run updates `worker_heartbeats`.

| Job | Every | What it does |
|---|---|---|
| `sec-ingest` | 15 min (`AUTO_INGEST=1`) | EDGAR current Form 4 feed → `sec_filings` / `sec_transactions`; then research events and alert fan-out. |
| `research-events` | 15 min | Incremental, idempotent build of `sec_events` (also covers imports started by `/v1/internal/ingest`). |
| `filing-retry` | 30 min | Failed Form 4 imports retried with backoff (15 min doubling, at most a day, 5 attempts). |
| `company-disclosures` | 30 min | SEC submissions of watched companies, each at most every 6 hours, at most 20 a run; stops on a 403. |
| `notifications` | 5 min | New events → `notifications` for members watching them. |
| `billing-reconcile` | 6 h | Stripe re-reads for lapsed periods. |
| `maintenance` | hourly | Expired sessions, rate-limit windows, used tokens, admin sessions, security events older than 180 days, abandoned email bodies. |

## 5. Monitoring

`GET /v1/admin/ops` (and `ops.html`) reports, without member addresses: ingestion freshness (stale when the last
successful run is older than 45 minutes with `AUTO_INGEST=1`, or the newest parsed filing older than 4 days; a
warning after 26 hours), stuck runs, filing errors, SEC request counts and the last SEC error for the instance,
research-event builder lag, failed imports, disclosure-source failures, alert and email queues, bounces,
suppressions, Stripe webhook recency and billing events, AI spend and outcomes, security events, every worker's last
run and error, capabilities and the source registry. `status` is `degraded` when anything is stale.

Point an external uptime monitor at `GET /healthz` (database and SEC configuration) and, with an admin session, check
`/v1/admin/ops` daily until alerting is wired to a pager. **Not built:** push alerts to a pager or chat channel.

## 6. One-off operations

- **Repair dates dropped by the old parser** (XML dates with a time zone, e.g. `2026-10-14-05:00`; found while
  verifying this release against live SEC documents): `DATABASE_URL=… SEC_USER_AGENT=… node scripts/reparse-missing-dates.mjs --dry-run`,
  then without `--dry-run`. Run once after deploying this release.
- **Verify stored records against the SEC:** `node scripts/verify-sec-records.mjs --limit=50`. Exit code 1 on any
  mismatch. Run after deploys and weekly.
- **Stripe test mode:** `STRIPE_TEST_SECRET_KEY=sk_test_… INSIDIR_STRIPE_PRICE_ID=price_… node scripts/stripe-test-mode-check.mjs`
  (refuses live keys). Then one manual checkout in a browser with test card 4242 4242 4242 4242 while
  `stripe listen --forward-to https://YOUR_DOMAIN/v1/billing/webhook` runs, and confirm the acknowledgment email.
- **Member journey in Chrome:** `INSIDIR_TEST_DATABASE_URL=… CHROME_BIN=… node scripts/journey-check.mjs` (throwaway
  database only; Stripe simulated).

## 7. Stripe dashboard actions the code cannot do

1. Webhook endpoint `https://insidir.com/v1/billing/webhook` must send: `checkout.session.completed`, `checkout.session.expired` (the abandoned-checkout reminder),
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`, `invoice.paid`,
   `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`. The test-mode script reports what is missing.
2. Customer portal: enable cancellation and payment-method updates.
3. Decide whether Stripe's own receipts stay on (Insidir now sends its own; two receipts are harmless but noisy).
4. Confirm the live Price is $39.00 USD monthly with no trial of its own.
5. Settings → Payment methods: turn on Apple Pay, Google Pay and Link for Checkout (Apple Pay also needs the
   insidir.com domain registered under Payment method domains). Checkout shows them automatically once on.
6. Leave Stripe's own abandoned-cart emails off (Settings → Checkout → Recovery emails): Insidir sends its one
   reminder itself, an hour after the page was opened, and only to accounts without a subscription.

## 8. Growth reports

- `/admin` (redirects to admin-funnel.html; token + one-time code as §2): the funnel from landing visit to paid,
  stock searches and stock pages, the headline A/B test (h1:a / h1:b), and visits, accounts, trials and paid members
  by `?ref=` source. Allowed sources: `INSIDIR_REFS` (comma-separated; defaults to the seven channels in
  src/attribution.mjs).
- PostHog (anonymous, never linked to an account): landing pageview → `ticker_searched` → stock pageview →
  `signup_code_sent` → `checkout_started` → `trial_confirmed` (welcome.html). Paid ($39 renewals) is only in /admin,
  because PostHog ids are not tied to accounts (privacy.html §2).

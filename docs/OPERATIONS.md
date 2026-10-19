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
| `INSIDIR_EMAIL_PROVIDER` | empty (nothing sent) | `postmark` in production; `log` prints messages to the console (local development only: it prints one-time links). |
| `POSTMARK_SERVER_TOKEN` | empty | Postmark server API token. |
| `INSIDIR_EMAIL_FROM` | empty | From address on a domain you have verified in Postmark (SPF, DKIM, Return-Path), e.g. `Insidir <notices@insidir.com>`. |
| `INSIDIR_EMAIL_REPLY_TO` | `hello@aethric.llc` | Reply-To. |
| `POSTMARK_TRANSACTIONAL_STREAM` / `POSTMARK_ALERT_STREAM` | `outbound` | Message streams. Put alerts and digests on a separate stream if Postmark asks for it. |
| `INSIDIR_EMAIL_WEBHOOK_SECRET` | empty | 24+ characters. Postmark webhook basic-auth password (section 3). |
| `INSIDIR_APP_SECRET` | empty | 32+ random characters. Signs one-click unsubscribe links. **Alert emails are not sent without it.** Changing it invalidates links already sent. |
| `INSIDIR_POSTAL_ADDRESS` | empty | Business postal address printed in alert-email footers (CAN-SPAM; ATTORNEY-REVIEW.md C-1). |
| `INSIDIR_REQUIRE_EMAIL_VERIFICATION` | on once email is configured | `1` forces, `0` disables. When on, checkout and complimentary access need a confirmed address. |
| `INSIDIR_AI_EXPLANATIONS` | off | `1` lets the explanation service call Claude. Leave off until counsel has reviewed it (ATTORNEY-REVIEW.md, D-1). |
| `ANTHROPIC_API_KEY` | empty | API key for explanations (only read when `INSIDIR_AI_EXPLANATIONS=1`). |
| `INSIDIR_AI_MODEL` / `INSIDIR_AI_EFFORT` | `claude-opus-5-5` / `medium` | Model and effort. |
| `INSIDIR_AI_DAILY_BUDGET_USD` / `INSIDIR_AI_PER_USER_DAILY` | `5` / `20` | Daily spend ceiling across all instances; model calls per member per day. |
| `INSIDIR_AI_INPUT_USD_PER_MTOK` / `INSIDIR_AI_OUTPUT_USD_PER_MTOK` | `4` / `20` | Prices used for the budget (update if the model or its price changes). |
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

## 3. Email (Postmark)

1. Create a Postmark server, verify the sending domain (DKIM and Return-Path DNS records), set the variables above.
2. Webhook: Servers → your server → Webhooks → add
   `https://postmark:<INSIDIR_EMAIL_WEBHOOK_SECRET>@insidir.com/v1/email/webhook/postmark` with **Bounce, Spam
   Complaint, Subscription Change and Delivery** events.
3. Every message is written to `email_outbox` first and delivered by the `email-delivery` worker every minute. Retries:
   1, 2, 4 … minutes, capped at 6 hours, abandoned after 8 attempts. Invalid or inactive recipients (Postmark codes
   300, 406) are not retried and are added to `email_suppressions`. Delivery is at least once: if an instance dies
   after Postmark accepted a message but before the row is marked, it is sent again after its 5-minute lock expires.
4. Bodies are erased after delivery or abandonment, except billing notices (`retain_body`), which are the record of
   what the customer was told.
5. Without a provider nothing is sent; messages wait in the outbox and the ops page shows the backlog. Emails queued
   while no provider was configured are delivered once one is (verification links expire after 48 hours, reset links
   after 1 hour; members can ask for new ones).

## 4. Background jobs

All run through `runWorker` (src/ops.mjs): one PostgreSQL advisory lock per job, so several instances never run the
same job at once; each run updates `worker_heartbeats`.

| Job | Every | What it does |
|---|---|---|
| `sec-ingest` | 15 min (`AUTO_INGEST=1`) | EDGAR current Form 4 feed → `sec_filings` / `sec_transactions`; then research events and alert fan-out. |
| `research-events` | 15 min | Incremental, idempotent build of `research_events` (also covers imports started by `/v1/internal/ingest`). |
| `filing-retry` | 30 min | Failed Form 4 imports retried with backoff (15 min doubling, at most a day, 5 attempts). |
| `company-disclosures` | 30 min | SEC submissions of watched companies, each at most every 6 hours, at most 20 a run; stops on a 403. |
| `notifications` | 5 min | New events → `notifications` for members watching them. |
| `alert-emails` / `daily-digests` | 5 min / hourly | Immediate alert emails; daily digests at each member's chosen hour. |
| `email-delivery` | 1 min | Outbox delivery (only when a provider is configured). |
| `billing-reconcile` / `trial-reminders` | 6 h / hourly | Stripe re-reads for lapsed periods; trial-ending reminders. |
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

1. Webhook endpoint `https://insidir.com/v1/billing/webhook` must send: `checkout.session.completed`,
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`, `invoice.paid`,
   `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`. The test-mode script reports what is missing.
2. Customer portal: enable cancellation and payment-method updates.
3. Decide whether Stripe's own receipts stay on (Insidir now sends its own; two receipts are harmless but noisy).
4. Confirm the live Price is $39.00 USD monthly with no trial of its own.

# Insidir release report — October 19, 2026

Branch `claude/friendly-lamport-kodugh` of `spartanapparelbiz-ui/insidir`. Prepared by engineering from what was
built and run in this session. It separates four things that are easy to blur: what is implemented and tested, what
is deployed and verified in operation, what is blocked on credentials or outside approvals, and what needs a lawyer.
**Nothing here says Insidir is legally compliant or certified.** All regulated capabilities remain off
(`RESEARCH_ONLY`).

Test data note: integration and browser tests use **synthetic** research fixtures (fictional issuers and people) and a
**Stripe simulator**; the SEC check in §1.9 used **real** EDGAR filings in an isolated database. None of these is the
production database.

---

## 1. Implemented and tested

Totals for the final run on this branch: see §1.10. Integration suites ran against PostgreSQL 16 in an isolated
throwaway cluster; CI now runs them too (a `postgres:16` service in `.github/workflows/engine-ci.yml`).

### 1.1 Audit fixes (Phase 1)
| Item | Evidence |
|---|---|
| Motion test failure reported in COMPLIANCE.md §1 item 8 | Already fixed on `main` by #36 (creators and partner pages load the motion layer); `test/motion.test.mjs` 7/7 pass. |
| Previously skipped PostgreSQL tests (5 suites) | Now run: all pass (`engine-auth`, `filing-owners`, `following`, `joint-lines`, `person-profile`). |
| Retired prototype scripts with invented trades (`alerts.js`, `dashboard.js`, `company.js`) | Deleted. Release gate now scans every script in `web/`, served or not; retired paths stay refused. |
| Alerts page switches that saved nothing (and a "coming soon" digest) | Replaced by real preferences saved by the engine; test asserts no `role="switch"` remains. |
| **Parser bug found by verification:** XML dates with a time zone (`2026-10-14-05:00`) stored as unknown | Fixed in `src/sec.mjs` (`xmlDate`), regression test, repair script `scripts/reparse-missing-dates.mjs` (see §1.9). |
| `/v1/sources` did not list Yahoo Finance, Wikimedia or company image sources | Now listed with their licence status. |

### 1.2 Account security
| Feature | Where | Tests |
|---|---|---|
| Email verification (hashed single-use tokens, 48 h, bound to the address; link token in the URL fragment) | `src/account-security.mjs`, `web/verify-email.html` | `test/account-security.test.mjs`, journey |
| Password recovery (same answer for every address, 1 h tokens, newer link voids older, reset signs out every session, notice email) | same, `web/forgot-password.html`, `web/reset-password.html` | same, journey |
| Password change (other sessions signed out), sign out other devices, recent security activity, data export | `src/account-security.mjs`, `web/account.html` | same, journey |
| Verification enforced once email is configured: checkout and complimentary access need a confirmed address | `src/paywall.mjs`, `src/billing.mjs` | `test/paywall.test.mjs`, lifecycle, journey |
| Rate limits shared by every instance (PostgreSQL, digest keys) incl. billing | `src/rate-limit.mjs` | two engine instances on one database share failures (`test/account-security.test.mjs`) |
| Admin MFA: token **and** RFC 6238 code, replay-protected across instances, 30-minute admin sessions, lockout after 10 failures | `src/totp.mjs`, `src/admin-auth.mjs` | RFC test vectors; replay on a second instance refused |
| Security event log (no addresses in clear, 180-day purge) | `src/security-events.mjs` | asserted no `@` in stored events |

### 1.3 Payments and subscription notices (Phase 2)
| Feature | Tests |
|---|---|
| Lifecycle through the real engine and PostgreSQL with a stateful **Stripe simulator**: new-account $1 trial eligibility and params; recorded consent to the exact offer (mismatched offer refused); events out of order and duplicated; trialing access; the $1 invoice never earns a commission; first $39 renewal earns exactly one; later renewals none; card failure → past_due → no access; refund and dispute → commission to review; online cancellation (trial never converts); returning account offered only the full price; deletion cancels in Stripe first; orphan checkout after deletion cancelled; forged and stale webhooks refused | `test/billing-lifecycle.test.mjs` (10 stages) |
| Notices, each queued once per Stripe object: acknowledgment with the consented terms and how to cancel; receipts; trial reminder (Stripe event + hourly backstop, once per subscription); failed payment; cancellation confirmation (in-app or portal); subscription ended; refund | `src/billing-notices.mjs`; asserted in the lifecycle test |
| Stripe **test-mode** verifier (refuses live keys): price, Checkout amounts with the engine's own params, trial → $39 conversion on a test clock, card failure, refund, cancellation, webhook events, portal cancellation | `scripts/stripe-test-mode-check.mjs` — **written, not run here (no test key)**; refusal paths verified |

### 1.4 Research engine (Phase 3)
`sec_events`: purchases and sales per Form 4 (exact decimal sums), Form 4/A line-by-line comparison
(superseding the corrected event, never double counting restatements), multi-insider purchase groups (distinct owners,
joint filing counts once, re-issued as they grow), watched companies' other SEC filings (baseline on first read);
trade date, filing time, retrieval time and detection time in separate columns; every accession and source URL;
caveats on every event; incremental cursor; failed imports retried with backoff; builder lag and source failures on
the ops page. Tests: `test/research-events.test.mjs` (synthetic filings).

### 1.5 Source-backed explanations (Phase 4)
Evidence packs with numbered sources and retrieval times; deterministic rules explanation always available; optional
Claude explanation (`INSIDIR_AI_EXPLANATIONS=1`, **off**) with a JSON schema, refusal fallbacks and server-side
validation that rejects invented citations, uncited facts, figures not matching the cited evidence by value,
directives, promises and speculation about motives or prices; advice requests and prompt injection refused before any
model call; daily budget and per-member allowance; cache. Tests: `test/explanations.test.mjs` (adversarial model
outputs, request shape, budget, cache, refusal, errors). **No real model call was made** (no API key configured).

### 1.6 Alerts (Phase 5)
Fan-out from research events to members watching the company or following the person (never holdings); unique per
member and event; in-app list and mark-read; preferences; email off/immediate/daily with recorded consent; exactly one
email per alert even with concurrent workers; only confirmed, unsuppressed addresses of members with access;
one-click unsubscribe (RFC 8058); bounce and complaint suppression; outbox retries and abandonment; delivery log with
bodies erased. Tests: `test/notifications.test.mjs`, `test/email-and-mfa.test.mjs`.

### 1.7 Product experience (Phase 6)
New pages `forgot-password`, `reset-password`, `verify-email`, `ops`; alerts page rebuilt on real data; account page
(email confirmation, password, sessions, activity, data download); company report research events with explanations;
subscribe page handles "confirm your email first" with a resend button; trial shown as "Trial · ends …". Same
identity (V13 palette, JetBrains Mono, existing classes; new styles in `v27-product.css` inside the `insidir-v13`
layer).

### 1.8 Browser verification (Chrome 1194, headless)
| Check | Result |
|---|---|
| `scripts/journey-check.mjs` — full member journey at 1440 px and 390 px: sign up → checkout waits for a confirmed address → emailed link confirms → $1 trial consent → (simulated) Stripe → billing shows trial → watched company alert → sourced explanation and advice refusal → alert-email consent → company research events → account security and data download → online cancel → deletion cancels in Stripe → password recovery | **26/26 steps passed, no page errors, no horizontal overflow** |
| `scripts/visual-layout-check.mjs` | Passed (first attempt timed out on a cold server; passed on retry) |
| `scripts/v13-palette-audit.mjs` (all 36 pages × 2 widths, new pages included) | Clean after two fixes found by it: native white checkboxes on the alerts preferences; the ops page lacked the standard footer |
| `scripts/motion-check.mjs` (changed and new pages: alerts, account, company, signin, subscribe, privacy, forgot, reset, verify, ops) | 283 + 24 passed after one fix (the ops page had no dot field). The unscoped run exceeded this session's 20-minute limit; it runs in CI |
| `scripts/dashboard-check.mjs` | 321 passed, 0 failed |
| `scripts/stories-check.mjs` | Passed |
| `scripts/media-check.mjs` | 518 passed, 3 failed on the first run: **regression found** — the alerts rewrite had dropped the 30-day watchlist activity table with real logos and headshots. Restored as its own section; alerts re-run 103 passed, 0 failed |

### 1.9 SEC records match their original documents
In an isolated database, the engine imported **40 live Form 4 filings from EDGAR** (declared User-Agent, normal
throttle). `scripts/verify-sec-records.mjs` re-fetched every original XML and compared all stored fields:
**39/40 matched on the first pass; 1 mismatched** (ASPI, accession 0001477932-26-006312: trade date and period stored
as unknown because the filer wrote `2026-10-14-05:00`). An independent raw-XML spot check (no parser) confirmed the
value. After the parser fix and `scripts/reparse-missing-dates.mjs`: **40/40 filings, 111 lines and 9 research events
matched**. This covers a sample in a test database, not the production database (run the same two scripts there:
OPERATIONS.md §6).

### 1.10 Final run (2026-10-19, after the last change)
| Run | Result |
|---|---|
| `npm run check` and `node --check` on every script | Pass |
| `npm test` with `INSIDIR_TEST_DATABASE_URL` (PostgreSQL 16) | **444 tests, 444 pass, 0 fail, 0 skipped** |
| `npm test` without a database (as on a laptop) | 402 tests, 391 pass, 0 fail, 11 skipped (the PostgreSQL suites) |
| `scripts/journey-check.mjs` | 26/26 steps, run twice after the last UI change |
| `scripts/visual-layout-check.mjs` | Pass at 375, 390 and 1440 px |
| `scripts/verify-sec-records.mjs` (live EDGAR, isolated DB) | 40/40 filings, 111 lines, 9 events match |

## 2. Deployed and operationally verified

| Check (read-only, production `https://insidir.com`, 2026-10-19 06:25 UTC) | Result |
|---|---|
| `/healthz` | 200 `{"ok":true,"db":"connected","secUserAgentConfigured":true}` |
| `/v1/capabilities` | `RESEARCH_ONLY`; advice and trading `disabled_pending_legal_authorization`; AI `none`; political `disabled…` |
| `/v1/sources` | SEC sources enabled; House, Senate, social and crypto `disabled_pending_permissions` |
| Is this release deployed? | **No.** Production answers 404 for `/forgot-password.html` and gates `/v1/admin/ops` as product data, i.e. it runs the previous code. This session has no deploy access and did not deploy. |

**Not operationally verified:** nothing in §1 has run in production yet. After deploying: run migrations (automatic at
start), `scripts/reparse-missing-dates.mjs`, `scripts/verify-sec-records.mjs`, open `ops.html`, and confirm workers
report and ingestion is fresh.

## 3. Blocked by missing credentials or external approvals

| Item | Needs |
|---|---|
| Stripe test-mode verification | A test-mode secret key and test Price: run `scripts/stripe-test-mode-check.mjs`, then one browser checkout with `stripe listen` |
| Stripe dashboard settings | Webhook events list, portal cancellation, receipt settings (OPERATIONS.md §7) — owner action |
| Any email being sent (verification, recovery, billing notices, alerts) | Postmark account, verified sending domain (DNS), `POSTMARK_SERVER_TOKEN`, `INSIDIR_EMAIL_FROM`, webhook secret, `INSIDIR_APP_SECRET`, `INSIDIR_POSTAL_ADDRESS` |
| Admin access after deploy | `INSIDIR_ADMIN_TOTP_SECRET` (admin routes are closed without it — including creator admin) |
| AI explanations | Anthropic API key **and** counsel's sign-off (D-1); stays off |
| Deployment of this branch | Owner merges and deploys; production verification in §2 then repeated |
| Licensed market data | A licensed vendor or Yahoo's written permission (G-1) |
| Restricted features (advice, trading, brokerage production, political data) | Unchanged preconditions (COMPLIANCE.md §7) |

## 4. Requires qualified legal review

All items in [ATTORNEY-REVIEW.md](ATTORNEY-REVIEW.md): adviser status and the research boundary (alerts, groupings,
holdings); automatic-renewal compliance, acknowledgment and reminder content, record retention; CAN-SPAM status of
alert emails; AI explanations; privacy laws and retention; security incident obligations; data licensing (Yahoo
Finance, images); creator program; corporate authority; Terms of Service updates (alerts, email, AI). The legal pages
were updated to describe the new behaviour accurately; they remain drafts no attorney has reviewed.

## 5. Known limitations

- The one-billing-change-per-account lock is per process (rate limits are shared; this lock is not).
- Email delivery is at least once (a crash between provider acceptance and marking can resend once).
- Ops alerts are pull-only (page and API); no pager or chat integration.
- The SEC disclosure poller covers watched companies only, at most every 6 hours each.
- The verification in §1.9 reuses the importer's parser for most fields; the independent check was a spot check.

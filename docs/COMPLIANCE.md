# Insidir compliance and risk-reduction report

> **Update, October 19, 2026.** Since this report: the retired sample-data scripts are deleted (§6, first item); the
> motion test passes on `main` (§1 item 8, §6); email now exists with a post-purchase acknowledgment, receipts, trial
> reminders, failed-payment and cancellation notices (§6, §8 "Post-purchase acknowledgment" is now IMPLEMENTED —
> TECHNICALLY VERIFIED WITH A STRIPE SIMULATOR · REQUIRES ATTORNEY REVIEW); email alerts exist behind recorded
> consent; source-backed explanations exist with the AI part off by default; admin access needs MFA. Release status
> and evidence: [RELEASE-REPORT.md](RELEASE-REPORT.md). Open legal questions: [ATTORNEY-REVIEW.md](ATTORNEY-REVIEW.md).

October 18, 2026. Prepared from the code in this repository. **This is an engineering audit, not legal advice.**
Nothing here, and no passing test, establishes that Insidir is legally compliant, registered, approved or exempt
from any law. Every item marked for attorney review or regulatory approval needs a qualified human to act on it.

---

## 1. What the product actually does today (audit)

| Area | Current behaviour, as found in the code |
|---|---|
| Research data | SEC Form 4 filings imported from EDGAR every 15 minutes (`src/ingest.mjs`, `src/sec.mjs`); company reports from SEC submissions and XBRL, delayed Yahoo Finance prices, Wikidata/Wikipedia profiles (`src/company-routes.mjs`). Every figure links to or names its source. |
| Public pages | Server-rendered insider pages `/insider-trading`, `/insider-trading/<TICKER>`, `/insiders/<cik>` from the import (`src/public-pages.mjs`). |
| Personal features | Watchlist, followed people, private research journal (statuses "researching / watching / passed"), manually entered holdings, in-app watchlist alerts. All scoped to the signed-in account. |
| AI | **Source-backed summaries only, off unless `INSIDIR_OPENROUTER_API_KEY` is set.** All model calls go through `src/ai-gateway.mjs` (budgets, timeouts, usage ledger, shared verified cache). Filing explanations and Investigate syntheses are written only from retrieved SEC records, must cite them, and pass `reviewGeneratedText` (no directives, guarantees or figures absent from the sources) before display; failures are cached as blocked and never shown. Questions are screened for personalized-advice requests and prompt injection before any retrieval. |
| Politician trades | **Not ingested or shown.** `src/analysis.mjs` lists House/Senate disclosures as `disabled_pending_permissions`. |
| Trading | **None.** No order, trade or execution code. The optional brokerage link (SnapTrade, `src/brokerage.mjs`) is OAuth **read scope only**, off unless `BROKERAGE_CONNECT_ENABLED=1`, tokens AES-256-GCM encrypted with per-user AAD; no brokerage passwords collected. |
| Billing | Stripe Checkout, one Price ($39/month), a $1 7-day trial on an account's first checkout, Stripe customer portal, webhook sync, six-hourly reconciliation, account deletion cancels Stripe first (`src/billing.mjs`). |
| Auth & security | scrypt password hashing (12–128 chars), random 256-bit session tokens stored as SHA-256 hashes, HttpOnly + SameSite=Lax + Secure cookies, 14-day sessions purged hourly, same-origin checks on every write, per-IP/per-account rate limits on sign-up, sign-in (failed attempts only), checkout, account deletion; password re-entry to delete an account; CSP, HSTS, X-Frame-Options DENY; paywall fails closed for every unlisted `/v1` route (`src/paywall.mjs`). |
| Creator program | $10 one-time commission per referred paying subscriber, manual 30-day review, no automatic payouts, self-referral blocked (`src/creator-program.mjs`, `CREATORS.md`). |

### Problems found during the audit

1. **Invented data shipped publicly.** `web/assets/js/alerts.js`, `dashboard.js` and `company.js` contained illustrative sample data, including a fabricated "Nancy Pelosi bought NVDA call options" alert and made-up executive trades and prices. No page loaded them, but they were publicly downloadable from the site.
2. **Misleading alerts screen.** `alerts.html` offered "Political Trades" and "Price Moves" filters and a congressional-disclosure alert switched on by default, though neither data source exists.
3. **Billing consent not recorded.** Checkout started on a click with no separate, recorded agreement to the automatic-renewal terms, and the subscribe page showed the $1 trial even to accounts that would be charged $39 (only Stripe's page showed the real amount).
4. **Cancellation depended on Stripe portal settings.** The only in-product route to cancel was Stripe's portal, which cancels only if cancellation is switched on in the Stripe dashboard.
5. **Refunds and chargebacks not handled.** A refunded or disputed customer's creator commission stayed "pending".
6. **No administrative audit trail** for creator-partner and commission admin endpoints.
7. **No server-side guard for regulated features.** Nothing stopped a future handler for recommendations or orders from going live on a code change alone.
8. **Pre-existing test failure on `main`.** `creators.html` and the three `partner-*.html` pages (added on main after the last release) do not load the site's motion scripts, so `test/motion.test.mjs` fails on `main`. Left as is: it is a design-system test about pages owned by the founder, not a compliance issue (see §6).

---

## 2. Prioritized risks

| # | Risk | Severity | Status after this change |
|---|---|---|---|
| 1 | Unregistered investment advice if any feature, page, creator or future AI tells a person what to buy, sell, hold or allocate (Investment Advisers Act §202(a)(11); state adviser laws incl. Florida Ch. 517) | High | Mitigated technically: RESEARCH_ONLY gate, advice/claims guard, release-gate tests. **Attorney review required** of the "publisher's exclusion" position (Lowe v. SEC) for the product as a whole. |
| 2 | Auto-renewal / negative-option law: ROSCA (15 U.S.C. §8403), FTC Act §5, California ARL as amended by AB 2863 (express separate consent, consent records ≥ 3 years, online cancellation), other state ARLs | High | Mitigated: recorded express consent to the exact offer, online one-step cancel, terms visible before purchase. **Attorney review required** (state-by-state, especially CA and any state requiring post-purchase acknowledgment emails). |
| 3 | Fabricated or misleading financial information (FTC Act §5, state UDAP, SEC antifraud exposure for touting) | High | Fixed: sample-data scripts never served; misleading alerts UI removed; release gate blocks invented-data markers. |
| 4 | Creator marketing without disclosure (FTC Endorsement Guides, 16 CFR Part 255) | Medium | Process in `CREATORS.md`/`docs/CREATOR-OUTREACH.md`; disclosures page states the program. Partner records are kept in `creator_partners`. **Owner action:** written agreements and monitoring of posts. |
| 5 | Personal data handling and retention (state privacy laws; Stripe and SnapTrade data) | Medium | Privacy policy updated to match behaviour (consent and billing records kept after deletion). **Attorney review required.** |
| 6 | Data licensing (Yahoo Finance prices, Wikimedia images, logo libraries) | Medium | Unchanged. **Attorney/partner review required** of Yahoo Finance's terms for commercial display. |
| 7 | Business authorization: who can contract with Stripe, creators and partners | Medium | Cannot be checked in code. See §7 checklist. |
| 8 | Future trading or advisory features | High if built | Disabled in code; two independent locks required (§3). |

Current law checked October 2026: the FTC's 2024 "click-to-cancel" amendments to the Negative Option Rule were vacated by the Eighth Circuit on July 8, 2025; the FTC published an advance notice of proposed rulemaking in March 2026 and no replacement rule is in force. ROSCA, FTC Act §5 and state laws still apply. California's AB 2863 amendments apply from July 1, 2025. Florida §501.165 covers automatic renewals of service contracts longer than set thresholds and likely does not reach a monthly plan, but should be confirmed by counsel. Sources are listed in §9.

---

## 3. Code changes in this release

| Change | Where | Tests |
|---|---|---|
| **RESEARCH_ONLY capability gate.** Advice-type paths (`/v1/recommendations`, `/v1/advice`, `/v1/ai/advice`, `/v1/me/allocations`, `/v1/signals`, …) and trading paths (`/v1/orders`, `/v1/trades`, `/v1/me/brokerage/orders`, `…/execute`, `…/positions/<x>/sell`, `/v1/me/auto-trade`, …) are refused with 403 **before the paywall and before any handler**, for every user, however the path is encoded. A regulated mode needs a code constant (`BUILD_AUTHORIZED_MODES`, currently RESEARCH_ONLY only) **and** a complete, in-effect authorization record in `docs/authorizations/` **and** the env request; an env flag alone does nothing. `GET /v1/capabilities` states what the deployment does. | `src/capabilities.mjs`, `src/api.mjs`, `docs/authorizations/` | `test/capabilities.test.mjs` |
| **Emergency stops.** `INSIDIR_TRADING_HALT=1` blocks trading even in an authorized build; `INSIDIR_BROKERAGE_HALT=1` suspends brokerage connections and reads (disconnect always works). | `src/capabilities.mjs` | `test/capabilities.test.mjs` |
| **Advice and claims guard.** Detects personalized-advice requests, prompt-injection attempts, buy/sell/hold directives, guarantees/approval/"secret information" claims (negation-aware), and figures not present in the cited sources; `reviewGeneratedText` blocks any generated answer without sources and a retrieval timestamp. Ready for any future AI feature; already used as a release gate over every page. | `src/compliance-guard.mjs` | `test/compliance.test.mjs` |
| **No invented data served.** `alerts.js`, `dashboard.js`, `company.js` are refused by the static server (`RETIRED_ASSETS`) under any path spelling; the release gate fails if any page or served script contains invented-data markers. | `src/web.mjs` | `test/compliance.test.mjs` |
| **Alerts page truthful.** Political-trade and price-move filters and switches removed; delivery stated as "In the app only". | `web/alerts.html` | `test/compliance.test.mjs` |
| **Recorded express consent to the exact offer.** The subscribe page shows the automatic-renewal terms for the account (trial or full price, amounts, first renewal date, how to cancel) from `GET /v1/billing/status`; checkout is disabled until a separate box is ticked. `POST /v1/billing/checkout` refuses without `{consent:true, offer, disclosureVersion}`, refuses with 409 if Stripe's history changes the offer (no one consents to $1 and pays $39), stores the consent (terms text, offer, amounts, time, IP, user agent) in `billing_consents` before Stripe is called, and ties it to the Checkout Session and subscription metadata. | `src/billing.mjs`, `sql/011_compliance_records.sql`, `web/subscribe.html`, `web/assets/js/subscribe.js` | `test/paywall.test.mjs`, `test/billing-compliance.test.mjs` |
| **One-step online cancellation.** `POST /v1/billing/cancel` sets `cancel_at_period_end` on every live subscription (a trial ends without the $39 charge; paid access runs to period end), re-syncs, logs the event; the Billing page has a Cancel button with one confirmation and shows "Trial ends" / "Access ends (will not renew)". | `src/billing.mjs`, `web/billing.html`, `web/assets/js/billing.js` | `test/billing-compliance.test.mjs` |
| **Refunds, chargebacks, failed payments, trial endings.** Webhook handles `charge.refunded`, `charge.dispute.created` (creator commission → `needs_review`, event logged), `invoice.payment_failed` (logged, access re-synced so past-due stops access), `customer.subscription.trial_will_end` (logged). | `src/billing.mjs` | `test/billing-compliance.test.mjs` |
| **Admin audit trail.** Every creator-admin request (allowed or refused) is logged with a token fingerprint (never the token), action, target and IP in `admin_audit_log`. | `src/creator-program.mjs`, `sql/011` | `test/compliance.test.mjs` |
| **Cross-account isolation test.** Private routes only ever query with the session's user id, whatever the request names; signed-out requests get 401. | — | `test/compliance.test.mjs` |
| **Public pages say what Form 4s are.** Legally required public reports, not nonpublic information. | `src/public-pages.mjs` | `test/public-pages.test.mjs` |
| **Legal pages.** New `disclosures.html` (regulatory status, financial risk, public records vs. nonpublic information, data accuracy and delays, automated/AI content, conflicts and affiliate relationships) and `subscription-policy.html`; Terms §2/§4 and Privacy §2/§5/§8 updated to match behaviour; footer links on every page and in the public pages; both added to the sitemap. | `web/*.html` | `test/web.test.mjs` (every link resolves) |

### Database migration
`sql/011_compliance_records.sql` (applied automatically on start): `billing_consents`, `billing_events`,
`admin_audit_log`, `users.cancel_at_period_end`.

---

## 4. Legal-document drafts (for attorney review)

The live pages are the drafts. None has been reviewed by an attorney.

| Document | Page |
|---|---|
| Terms of Service | `web/terms.html` |
| Privacy Policy | `web/privacy.html` |
| Financial Risk Disclosure | `web/disclosures.html` §2–3 |
| AI Research Limitations | `web/disclosures.html` §5 |
| Subscription and Cancellation Policy | `web/subscription-policy.html` |
| Data Accuracy and Reporting Delays | `web/disclosures.html` §4 |
| Conflicts of Interest and Affiliate Disclosures | `web/disclosures.html` §6 |

Statements in these pages that **the owner must confirm are true** before relying on them: Aethric LLC is not
registered as an investment adviser and is not a broker-dealer; Insidir is paid only by subscriptions; price increases
will be notified at least 30 days ahead by email; Stripe receipts are switched on for customers.

---

## 5. Test evidence

`npm test`: **354 tests: 348 pass, 1 fails, 5 are skipped (they need a live PostgreSQL).** The single failure is `test/motion.test.mjs` "every page carries the
engine, then the motion layer", which already fails on `main` because `creators.html` and `partner-*.html` (added on
main) do not load `v13-halftone.js`/`v13-motion.js`. `npm run check` passes.

New and changed suites: `test/capabilities.test.mjs`, `test/compliance.test.mjs`, `test/billing-compliance.test.mjs`,
`test/paywall.test.mjs` (consent and offer checks), `test/public-pages.test.mjs`.

Not run in this session: the Chrome checks (`scripts/visual-layout-check.mjs`, `v13-palette-audit.mjs`,
`motion-check.mjs`, `dashboard-check.mjs`) against the new subscribe/billing/legal page markup. CI runs them.

---

## 6. Remaining failures and incomplete integrations

- **Retired scripts still in the repository.** `web/assets/js/alerts.js`, `dashboard.js` and `company.js` are no longer served but were not deleted in this session; delete them.
- **`main` is red** on the motion test because of `creators.html` and `partner-*.html` (see §1, item 8).
- **Stripe dashboard settings the code cannot set:** turn on customer emails for successful payments and receipts; turn on "trial will end" reminder emails; enable cancellation in the customer portal (the in-app cancel works regardless); add `charge.refunded`, `charge.dispute.created`, `invoice.payment_failed`, `customer.subscription.trial_will_end` and `invoice.paid` to the webhook endpoint.
- **No post-purchase acknowledgment email from Insidir.** California's ARL requires an acknowledgment with the terms, cancellation policy and how to cancel; Stripe's receipt may not cover all of it. Needs an email provider and counsel's sign-off on content.
- **No email notice system** for price changes (the subscription policy promises 30 days' notice).
- **Consent records retention job.** Records are kept indefinitely today; a deletion job after the retention period needs counsel to set the period.
- **Data licensing** of Yahoo Finance prices for commercial display is unverified.
- **Partner pages** (`partner-*.html`) name real creators and companies as "research concepts"; they carry a clear scope note but should be reviewed (no implied endorsement or agreement).

---

## 7. Human actions required: registrations, approvals, contracts and reviews

**Before continuing to sell subscriptions**
- [ ] Securities attorney review of the research-only position (publisher's exclusion), the public pages, alerts and the creator program, including Florida (Ch. 517) and any state where marketing is targeted.
- [ ] Consumer-protection attorney review of the subscription flow, consent wording, cancellation flow, acknowledgment email and state auto-renewal compliance (California AB 2863 and others).
- [ ] Privacy review of the privacy policy and data retention (consent records, billing events, audit logs).
- [ ] Confirm the facts the legal pages state (§4).
- [ ] Confirm Aethric LLC is in good standing, and that the person who opened the Stripe account and signs creator agreements is an adult authorized to bind the company. Stripe requires the account representative to be at least 18 and authorized; a minor cannot be the authorized representative and cannot act as a registered adviser, broker-dealer principal or compliance officer. If the founder is under 18, an adult officer or manager must hold these roles.
- [ ] Written creator agreements (compensation, FTC disclosure duty, no investment-advice claims), and a process to check partners' posts.
- [ ] Review Yahoo Finance and other data-source terms for commercial use.

**Before ADVISORY_ENABLED (personalized recommendations)**: all of: SEC or state investment-adviser registration (or a documented arrangement with a registered adviser), attorney review of structure and compensation, named CCO and supervisor, client advisory agreement and Form ADV/CRS-type disclosures, client profiling and suitability/fiduciary controls, conflict policy, documented AI model testing, monitoring and human oversight, books-and-records and complaint handling, then a complete `docs/authorizations/advisory.json` **and** a reviewed code change to `BUILD_AUTHORIZED_MODES`.

**Before TRADING_ENABLED (orders through a broker)**: all of: executed partnership with a FINRA-member broker-dealer (e.g. Alpaca or DriveWealth, subject to their approval), partner-run KYC/CIP onboarding, customer account and trading authorization agreements, a clear split between customer-directed and discretionary orders (discretion requires an advisory agreement and registration), risk controls (limits, duplicate-order prevention, idempotency keys, reconciliation, error handling, audit logging), secure credential handling, use of the existing `INSIDIR_TRADING_HALT` kill switch in runbooks, then a complete `docs/authorizations/trading.json` **and** a reviewed code change. Until then there is no trading code at all, simulated or real, and no execution credentials exist.

---

## 8. Feature status

| Feature | Status |
|---|---|
| SEC filing and Form 4 research, company reports, people files | IMPLEMENTED — TECHNICALLY VERIFIED · REQUIRES ATTORNEY REVIEW (research-only position) |
| Public insider pages, sitemap | IMPLEMENTED — TECHNICALLY VERIFIED · REQUIRES ATTORNEY REVIEW |
| Watchlist, follows, journal, manual holdings | IMPLEMENTED — TECHNICALLY VERIFIED |
| In-app watchlist alerts (Form 4 matches) | IMPLEMENTED — TECHNICALLY VERIFIED |
| Email / push alerts | Not built |
| Politician (congressional) transactions | DISABLED — PENDING LEGAL AUTHORIZATION (licensing and legal review) |
| AI summaries and explanations | Built for source explanation only (Insidir Intelligence), cited and verified; nothing beyond source explanation. **Attorney review recommended** of AI-written summaries under the publisher's exclusion before enabling the provider key in production |
| Intelligence Mirror (13F illustrative allocation) | Research simulation only: no orders, no brokerage link, no copy action, no recommended allocation. **Regulatory review required** before launch of whether presenting proportional "illustrative" allocations of a named manager's holdings could be viewed as personalized advice or a model portfolio |
| Personalized AI recommendations (ADVISORY_ENABLED) | DISABLED — PENDING LEGAL AUTHORIZATION · REQUIRES REGULATORY OR PARTNER APPROVAL |
| Order placement / automated trading (TRADING_ENABLED) | DISABLED — PENDING LEGAL AUTHORIZATION · REQUIRES REGULATORY OR PARTNER APPROVAL |
| Read-only brokerage link (SnapTrade) | IMPLEMENTED — TECHNICALLY VERIFIED, off by default · REQUIRES REGULATORY OR PARTNER APPROVAL (SnapTrade production agreement) |
| $39/month subscription, $1 7-day trial | IMPLEMENTED — TECHNICALLY VERIFIED · REQUIRES ATTORNEY REVIEW (auto-renewal law) |
| Recorded consent, online cancellation, refunds/disputes handling | IMPLEMENTED — TECHNICALLY VERIFIED · REQUIRES ATTORNEY REVIEW |
| Post-purchase acknowledgment and price-change emails | BLOCKED — UNRESOLVED RISK (no email system) |
| Creator referral program | IMPLEMENTED — TECHNICALLY VERIFIED · REQUIRES ATTORNEY REVIEW (agreements, FTC disclosure monitoring) |
| Admin audit trail | IMPLEMENTED — TECHNICALLY VERIFIED |
| Legal pages | REQUIRES ATTORNEY REVIEW |
| Business authorization of contracting persons | REQUIRES ATTORNEY REVIEW (cannot be verified in code) |

---

## 9. Sources checked (October 2026)

- Eighth Circuit vacatur of the FTC Negative Option ("click-to-cancel") Rule, July 8, 2025: [WilmerHale](https://www.wilmerhale.com/en/insights/client-alerts/20250801-eighth-circuit-vacates-the-ftcs-click-to-cancel-rule-but-federal-and-state-regulators-likely-to-remain-active)
- FTC reopened rulemaking (ANPRM, March 2026): [Jones Day](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses)
- California AB 2863 (automatic renewal): [bill text](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2863), [DTO Law summary](https://dtolaw.com/news/californias-automatic-renewal-law-new-requirements-businesses-should-know-about/)
- Florida §501.165: [Florida Senate](https://www.flsenate.gov/Laws/Statutes/2025/0501.165)

These were read from secondary summaries and official statute pages; counsel should confirm current status.

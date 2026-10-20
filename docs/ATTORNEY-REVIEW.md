# Attorney-review checklist

Prepared October 19, 2026 from the code in this repository by engineering. **This is not legal advice and nothing in
it has been reviewed by a lawyer.** Every item below is a question engineering cannot resolve; each is marked
**LEGAL QUESTION** and states what the software does today, so counsel can judge it against the facts. No item should
be treated as resolved until a qualified attorney signs it off (record the name and date in the last column of
section 12).

Product facts that apply throughout: Insidir (operated by Aethric LLC) is a $1-for-3-days, then $39/month research
subscription built on public SEC filings. It runs in `RESEARCH_ONLY` mode: personalized advice and trading endpoints
are refused by the server (`src/capabilities.mjs`); politician trades, social data, crypto attribution and read-only
brokerage links are off. See [COMPLIANCE.md](COMPLIANCE.md) for the earlier audit.

---

## 1. Investment-adviser status and the research boundary

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| A-1 | Does Insidir as a whole qualify for the publisher's exclusion (Advisers Act §202(a)(11)(D), *Lowe v. SEC*), and under Florida Ch. 517 and the laws of states where it is marketed? | Impersonal, bona fide, regularly published research from public records; same content for every subscriber; no advice on a member's own portfolio. |
| A-2 | Are **alerts** (a factual notice that a watched company or followed person filed a Form 4) consistent with that position, given they are timed to filings and delivered individually? | Alerts restate the filing (who, what, shares, price, dates, link); never matched against holdings; never say buy, sell or hold. |
| A-3 | Is the **multi-insider purchase grouping** ("2 or more distinct reporting owners bought within 14 days") a factual compilation or could it be characterized as a trading signal? | Labelled as a grouping with caveats ("does not mean the owners acted together … not a forecast"); no score, ranking or price expectation. |
| A-4 | Do the **manual holdings** and the optional read-only brokerage view, next to filings for the same tickers, create a personalized-advice risk? | Holdings are only shown with filings for the same tickers ("not a recommendation"); alerts deliberately do not use holdings. |
| A-5 | Is marketing copy (landing, pricing, stories, creator pages) free of performance claims under Advisers Act and FTC Act §5 standards? | A release gate (`test/compliance.test.mjs`) blocks guarantees, approval claims, "secret information" and directives in every page. |

## 2. Consumer subscription law

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| B-1 | Does the checkout flow satisfy ROSCA (15 U.S.C. §8403), FTC Act §5 and each targeted state's automatic-renewal law (California B&P §17600 et seq. as amended by AB 2863; New York, Illinois, Colorado, Virginia, others)? | Terms for the account's exact offer shown before checkout; separate unticked consent box; consent recorded with text, version, time, IP, user agent; Stripe's page repeats the terms. |
| B-2 | Is the **acknowledgment email** content sufficient where the law requires one (California requires the terms, cancellation policy and how to cancel, in a form the consumer can retain)? | Sent after checkout with the consented text, amounts, renewal, "How to cancel" and a Billing link; body retained as a record. Draft wording in `src/billing-notices.mjs`. |
| B-3 | Is a **trial-ending reminder** required for a paid 3-day trial, and is "about 24-48 hours before, plus Stripe's trial_will_end" adequate in timing and content? | One reminder per subscription, from Stripe's event or an hourly backstop when the trial ends within 48 hours. |
| B-4 | Is **online one-step cancellation** compliant everywhere targeted (including "click to cancel" state laws), and is "access until the end of the paid period, no partial refunds unless the law requires" acceptable? | Cancel button with one confirmation; cancellation email; account deletion cancels first. |
| B-5 | Must monthly renewals have **pre-renewal notices** in any targeted state, and is the 30-days-before-price-change promise in the Subscription policy sufficient? | Receipts after each payment; no pre-renewal notice for monthly renewals; no price-change mailing tool exists (no price change is planned). |
| B-6 | How long must consent and billing records be kept, and may they be kept after account deletion (with the email address, unlinked)? | Kept indefinitely today; deletion job not built pending this answer. |
| B-7 | Refund policy ("case by case") and chargeback handling: compliant and consistent with card-network rules? | Refunds and disputes logged; creator commission sent back to review. |
| B-8 | Sales tax / VAT on digital subscriptions in states and countries where customers are located. | Stripe Tax not configured; prices are shown tax-exclusive ("taxes, if any, shown by Stripe"). |

## 3. Email

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| C-1 | Are alert emails and digests "transactional or relationship" messages or commercial messages under CAN-SPAM, and are the sender identification, physical postal address and unsubscribe mechanics sufficient? | Opt-in only, with recorded consent text; one-click unsubscribe (RFC 8058) in every alert email; the business postal address is added to the footer from `INSIDIR_POSTAL_ADDRESS`, **which is not set yet** (the ops page warns while alert emails are on without it). |
| C-2 | Can subscription and security notices be sent regardless of alert preferences? | Yes, they are sent to the confirmed address whatever the preferences; the footer says so. |
| C-3 | Consent text for alert emails (`ALERT_CONSENT_TEXT`, `src/notifications.mjs`): adequate? Any state or foreign (e.g., CASL, GDPR) requirements for non-US users? | Single opt-in after email confirmation; recorded in `email_consents`. Non-US users are not blocked. |

## 4. AI explanations (built, **off by default**)

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| D-1 | May Insidir switch on AI-written explanations of filings without changing its regulatory position, and what disclosures are required (FTC guidance on AI claims, state AI disclosure laws)? | Off unless `INSIDIR_AI_EXPLANATIONS=1`. When on: evidence-only input, schema-constrained output, server validation (citations, figures, directives, promises, speculation), refusal of advice questions before any model call, "Written by an AI model" label, sources and retrieval times shown. |
| D-2 | Anthropic's commercial terms, acceptable-use policy and data-processing terms: acceptable for this use? Is a DPA needed? | Only public-record evidence of one filing is sent; no member data. |
| D-3 | Liability for an inaccurate explanation that passes the automated checks. | Every explanation links the original filing and says AI output can be wrong; terms do not yet address AI content specifically. |

## 5. Privacy

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| E-1 | Which state privacy laws apply (CCPA/CPRA thresholds, Florida, Virginia, Colorado, Texas, others) and does the policy meet their notice and rights requirements? | Policy updated October 19, 2026 to cover security logs, email, alerts, consents and AI. Self-service export and deletion exist. |
| E-2 | Retention: 180 days for security events (IP, user agent); indefinite for consent and billing records; email bodies erased after delivery except billing notices. Appropriate? | As stated. |
| E-3 | Is storing the client IP and user agent with consents and security events proportionate? | Stored; emails in logs only as SHA-256 digests (which are re-identifiable by anyone holding the address). |
| E-4 | Minors: the Terms and Privacy policy speak to under-13s and parental consent. Is a minimum age of 18 needed for a paid financial-research subscription? | No age gate. |
| E-5 | Are the subprocessors (hosting, PostgreSQL, Stripe, Postmark, Anthropic when enabled, Wikimedia images) disclosed adequately and are DPAs in place? | Named in the policy; DPAs are a business action. |

## 6. Security and incident response

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| F-1 | Does any financial-privacy rule (GLBA / FTC Safeguards Rule) apply to Insidir, given it does not hold customer funds or provide financial products? | Not assessed. |
| F-2 | Breach-notification obligations (all 50 states) and an incident-response plan. | No written plan; security events and admin audit logs exist; ops monitoring has no pager. |
| F-3 | Is an independent penetration test required before broad launch (by contract with Stripe, Postmark or SnapTrade, or by any law)? | Not performed. |

## 7. Data sources and licensing

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| G-1 | Commercial use of Yahoo Finance's unofficial chart and news endpoints. | Used for delayed prices and headlines; `MARKET_DATA_PROVIDER=none` turns it off. **Likely needs a licensed vendor.** |
| G-2 | SEC EDGAR: fair-access compliance and republication of filings (public domain) on public SEO pages. | Declared User-Agent, ≤8 requests/second shared throttle, stops on 403, caching. |
| G-3 | Company logos, Wikimedia images (CC licences: attribution, share-alike), headshots from company websites and SEC proxy statements: right to display; right of publicity for executives. | Credits shown; takedown process; strict identity matching. |
| G-4 | Politician (congressional) trade disclosures, social media data and crypto attribution: remain off. What licences and legal analysis are needed before any of them? | Disabled in the source registry; no code fetches them. |

## 8. Creator program

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| H-1 | FTC Endorsement Guides (16 CFR 255): written agreements, disclosure wording, monitoring of creators' posts. | $10 one-time commission after the first $39 payment; manual approval; disclosure duty stated in CREATORS.md. |
| H-2 | Could paying creators who discuss specific securities be "touting" (Securities Act §17(b)) or create adviser-solicitation issues? | Creators are told not to give investment advice; no per-security payments. |
| H-3 | Tax reporting (Form 1099-NEC) and payout terms. | Payouts are manual and outside the software. |

## 9. Corporate authority

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| I-1 | Is Aethric LLC in good standing, and is the person who controls the Stripe, Postmark and Anthropic accounts and signs creator agreements an adult authorized to bind it? | Cannot be verified in code (see COMPLIANCE.md §7). |

## 10. Terms of Service

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| J-1 | The Terms need sections on alerts, email notices, AI explanations (when enabled), the data export, and limitation of liability for delayed or incomplete data. Draft and approve. | Terms last updated October 18, 2026; they do not yet mention alerts or AI explanations. |

## 11. Restricted features: preconditions (unchanged)

Personalized advice (`ADVISORY_ENABLED`) and order placement (`TRADING_ENABLED`) need everything listed in
COMPLIANCE.md §7 plus a reviewed code change and a complete authorization record; read-only brokerage needs a
SnapTrade production agreement and a security review. Nothing in this release changes those locks.

## 11a. Added by the October 19 merge and visual release

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| K-1 | **Mirror** (Intelligence page): is the name, or a list of a followed insider's reported purchases and sales with reporting delays, likely to be read as a copy-trading or signal service? | Read-only list of public Form 4 events for people the member follows, 180 days, with trade date, filing date and delay. The page and the API (`copyTrading:"not_available"`, `orderPlacement:"not_available"`) state that it does not copy trades, place orders, model a portfolio or estimate returns. Renaming it (e.g. "Reported record") is a one-line change if counsel prefers. |
| K-2 | **Web push product updates**: the push opt-in says members also receive "occasional important Insidir product updates" (operator broadcasts, `src/push.mjs`). Are these commercial messages needing separate consent or an opt-out other than turning notifications off? | One opt-in covers alerts and broadcasts; disabling notifications on the device stops both. Broadcasts are configured by the operator in environment variables; there is no customer-facing broadcast route. |
| K-3 | **OpenRouter explanations** (`src/ai-explain.mjs`, from main): same questions as D-1–D-3 for a second AI provider (OpenRouter and the routed model vendor). | Active only when `INSIDIR_OPENROUTER_API_KEY` is set; daily and hourly caps. Production reported `aiGeneratedContent:"none"` on October 19, 2026. |
| K-4 | **Bluesky public posts and House financial disclosures** (`src/intelligence-monitor.mjs`, `src/house-disclosures.mjs`, from main): social-data and politician-disclosure use (G-4). | Bluesky reads only handles listed in `INSIDIR_BLUESKY_HANDLES` (none by default); House disclosures run only with `INSIDIR_HOUSE_DISCLOSURES_APPROVED=1` and report "blocked pending legal approval" otherwise. Neither was switched on by this release. |

## 11b. Added by the October 19 redesign and legal consistency audit

What changed in the public pages: the landing page now leads with automated monitoring ("The market doesn't stop.
Neither does your research system.") and shows a labelled example built from one real Form 4 (PepsiCo, accession
0001061272-26-000004). Terms (now effective October 19, 2026), Privacy, Disclosures, the Subscription policy and
Pricing were revised so that they describe what the code does. Nothing in the checkout consent text, Stripe
configuration or trial behavior changed.

| ID | LEGAL QUESTION | What the software does today |
|---|---|---|
| L-1 | **Refunds.** The pages used to differ ("handled case by case" vs. "only where the law gives you a right"). They now say, everywhere: payments are not refunded automatically, refund requests are reviewed, and any legal refund or cancellation right applies in addition. Is that adequate for state automatic-renewal laws and for any non-U.S. customers' withdrawal rights? | There is no refund action in the code; refunds are made by the operator in Stripe and trigger a notice email by webhook. |
| L-2 | **Marketing claims about monitoring.** The landing page says Insidir "monitors public disclosures" and shows check intervals ("about every 15 minutes" for Form 4, "every few hours" for watched companies' 8-K/6-K, "about twice a day" for 13F), each next to statements that coverage and timing are not guaranteed. Are these claims and qualifiers sufficient (FTC Act §5, state UDAP)? | Intervals are the scheduler's settings (`src/server.mjs`). Form 4 import needs `AUTO_INGEST=1`; production imported Form 4 filings on October 19, 2026. Per-company 8-K checks are rate-limited (20 companies per run, each rechecked every 6 hours). |
| L-3 | **The real-filing example.** The landing page names a real director and his October 2026 Form 4 and quotes its footnote. Is naming a private individual's public filing in marketing acceptable (right of publicity, false light), or should the example be anonymized? | The figures were checked against the filed XML on SEC EDGAR. The example is labelled "not live data" and does not characterize the trade beyond quoting the footnote. |
| L-4 | **AI providers and member data.** Privacy now says Investigate answers sent to an AI model can include facts about the member's watchlist or followed people, and the member's question. Is a privacy-policy disclosure enough, or is opt-in consent needed (state privacy laws; "sensitive" financial data)? Do the OpenRouter / OpenAI / Anthropic commercial terms meet the retention and no-training commitments counsel wants to make? | AI wording is off in production (`aiGeneratedContent:"none"`). When on: OpenRouter (OpenAI models) for filing summaries and Investigate synthesis; Anthropic for per-record explanations. Notes, holdings, email and payment data are never sent. |
| L-5 | **Analytics and GPC.** Privacy now discloses that the visitor number is linked to an account at signup and that account events are still recorded under Global Privacy Control. Does that treatment of GPC satisfy CCPA/CPRA and Colorado/Connecticut opt-out rules, given no data is sold or shared? | Client events are suppressed under GPC/DNT (`web/assets/js/funnel.js`); server events (signup, checkout, renewal, cancellation) are recorded without a visitor number. Retention: 13 months. |
| L-6 | **Push to devices.** Privacy now names the browser push services (Google, Mozilla, Apple, Microsoft) and says opted-in devices may receive occasional product announcements (see K-2). | Push needs VAPID keys on the server; when they are missing, the Alerts page says push is not available and shows no button. |
| L-7 | **Email notices promised in the Subscription policy** (receipt, trial reminder, failed payment, cancellation). These depend on an email provider (`INSIDIR_EMAIL_PROVIDER=postmark`). If production has no provider configured, the policy promises notices that are not sent. Should the policy be conditioned, or should Postmark be configured before relying on it? | The outbox queues every notice; without a provider nothing is delivered. Stripe may send its own receipts if enabled in the Stripe dashboard. |
| L-8 | **13F disclosures.** Disclosures and Terms now explain the 45-day filing lag, partial coverage (selected managers, long U.S.-listed positions only, possible confidential omissions) and that Mirror allocations are hypothetical. Are these adequate for Mirror's "hypothetical allocation" feature (Advisers Act publisher exclusion; hypothetical-performance concerns)? | Mirror computes proportional splits of a typed budget, long share positions only, with no orders, no copy button and no performance figures. |

## 12. Sign-off

| ID(s) | Attorney | Date | Decision / changes required |
|---|---|---|---|
| | | | |

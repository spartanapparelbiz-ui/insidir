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

## 12. Sign-off

| ID(s) | Attorney | Date | Decision / changes required |
|---|---|---|---|
| | | | |

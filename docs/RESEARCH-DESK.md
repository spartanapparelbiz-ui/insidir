# Insidir Research: SEC filing intelligence for members

Product spec for the four retention features (Watchlists & alerts, Research journal, Cluster & Whale stream,
Positions & paper-trail desk) and the legal framework that wraps them. Written against the code as it stands on
2026-11-06 so it can be built in phases without guesswork.

Code comments cite sections of this file as `docs/RESEARCH-DESK.md §N`. Where this file and `docs/INSIDIR-V2.md`
conflict on an SEC surface, this file wins. Billing, Whop, auth and pricing ($39/mo) stay as they are.

> **Built (Nov 6, 2026), with these changes from the plan below.** `/research` is a retired route (301 to `/board`),
> so the desk lives at **`/filings`** and **`/filings/<TICKER>`**. The code is in `lib/filings/`, `components/filings/` and
> `app/api/filings/`. To keep costs down, the data model is leaner than §4:
> - Alerts are not written once per member. `sec_filings` is written once per filing and is the feed. Each browser
>   filters the shared feed by its own watchlists, and per member only a read cursor is stored.
> - Watchlists are stored as one row per list (a JSON array of companies). The journal is one row per company
>   (status, history and notes). Positions are one JSON document per member.
> - The Cluster rule uses calendar weeks (Monday–Sunday), as in "the same week", instead of a rolling 7-day anchor.
> - XBRL, Wikidata and delayed quotes are not built yet. P&L uses a mark the member types.
> - The UI is a terminal (Nov 6, 2026, second pass): see the README's Filings section. The status-bar disclaimer reads
>   "Insidir is independent research software. Not a registered investment adviser or broker. Data sourced directly
>   from public SEC EDGAR filings." (`RESEARCH_DISCLAIMER`, version 2, so members accept it again). Colour now marks
>   record type only: code P emerald, code S crimson, 8-K cyan; gains and losses stay uncoloured.

---

## §0 Where the code is today (read before building)

| Piece | State | Where |
|---|---|---|
| Form 4 parsing (P/S lines, exact value from filed decimals, 4/A skipped) | **Built** | `lib/stocks/form4.ts` (`parseAtom`, `filedValue`, `easternToMs`) |
| Form 4 storage | **Built**, P and S lines only | `terminal.insider_trades` (`lib/db/schema.ts`) |
| EDGAR client (User-Agent, < 10 req/s, URL allow-list) | **Built** | `lib/stocks/sec.ts` (`SecClient`, `allowedSecUrl`) |
| EDGAR history backfill per owner / issuer | **Built** | `lib/stocks/history.ts`, `terminal.sec_history` |
| Form 4 poll in the worker | **Off** ("stocks off: no SEC or stock-price jobs", `worker/index.ts` header) | `lib/stocks/jobs.ts` `form4Once`, `STOCKS_FORM4_MS` = 2 min |
| Daily closes (Stooq, then Yahoo chart API) | **Built**, not scheduled | `lib/stocks/prices.ts`, `terminal.stock_closes` |
| Company follows (issuer CIK) | **Built** | `terminal.follows` kind `company`, `lib/follows.ts` |
| Web push delivery | **Built** | `terminal.push_subscriptions`, `lib/alerts/send.ts` |
| 8-K ingestion | **Missing** | `allowedSecUrl` only admits `getcurrent&type=4` |
| XBRL company facts | **Missing** | needs `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` |
| Ticker → CIK directory | **Missing** | needs `www.sec.gov/files/company_tickers.json` |
| Wikidata company identity | **Missing** in the web app (only `scripts/people-sync.py`, `lib/art`) | |
| Company / insider pages | **Missing** in `app/` (the README describes `/insider-trading/<TICKER>`, but no route exists) | |

Naming collisions to avoid:

- `terminal.watchlist` already exists (the millionaire wallet list). The member ticker lists are `user_watchlists`.
- `/desk` and `lib/desk` are the millionaire member home. This area lives under **`/research`**; its code goes in
  `lib/sec-research/` and `components/sec-research/` (`lib/research` is the existing LLM question feature).

---

## §1 Product boundary

**Insidir Research is software that organises public records.** It fetches, parses, stores and displays what
issuers and insiders filed with the SEC, plus a delayed quote, and gives members private tools (lists, notes, a
position log and calculators) that act only on what the member types.

| It does | It never does |
|---|---|
| Show raw Form 4 transaction codes, dates, shares, prices and values exactly as filed | Recommend buying, selling, holding or betting |
| Show 8-K item numbers with the SEC's official item titles | Summarise or interpret a filing with AI or by hand |
| Show XBRL figures as filed, with concept name, period, form and accession | Show price targets, fair values or ratings |
| Flag filing patterns that match a published, fixed rule (§7) | Score, rank or label anything by "conviction", "strength" or likelihood |
| Do arithmetic on numbers the member enters | Pre-fill a probability, a target or an assumption |
| Link every figure to its sec.gov document | Connect to a broker, hold funds or place orders |

### §1.1 Data sources

| Source | What we take | Cadence | Label shown next to it |
|---|---|---|---|
| SEC EDGAR current-filings Atom (`getcurrent`, type 4 and 8-K) | New filings | every 60 s | "SEC EDGAR" + accepted time (ET) |
| EDGAR filing documents (Form 4 XML, 8-K index) | Transaction lines; 8-K item numbers | on detection | link to the document |
| `data.sec.gov/submissions/CIK##########.json` | Filing history, SIC, fiscal year end, tickers | daily per watched issuer | "SEC EDGAR" |
| `data.sec.gov/api/xbrl/companyfacts/…` | Curated XBRL concepts (§6.4) | daily per watched issuer, and on a new 10-K/10-Q | "SEC XBRL, as filed" |
| `www.sec.gov/files/company_tickers.json` | Ticker ↔ CIK ↔ name | daily | n/a (lookup) |
| Yahoo Finance chart API (Stooq fallback for closes) | Delayed last price, daily closes | 60 s per visible ticker, cached; closes daily | "Delayed quote, Yahoo Finance, as of HH:MM ET" |
| Wikidata | Official website, HQ location, inception year | weekly | "Wikidata (community-edited)" |

Rules: every displayed number carries its source label; anything older than its freshness limit shows the stale
state (BRIEF §2 data states); a missing value hides its element, never a placeholder (BRIEF §2 honesty).

`allowedSecUrl` must be extended for: `getcurrent` with `type=8-K`, `data.sec.gov/api/xbrl/companyfacts/CIK\d{10}.json`,
and `www.sec.gov/files/company_tickers.json`. Keep the exact-key matching style it uses today; add a test per URL.

---

## §2 Legal boundary and disclaimer framework

### §2.1 Data vs. advice: the display rules

| Allowed (data) | Forbidden (advice / signal) |
|---|---|
| `P — Open market or private purchase` | "Insider buying is bullish" |
| `S — Open market or private sale` | "Sell signal", "Exit now" |
| "3 reporting owners filed code P between Oct 2 and Oct 6" | "High-conviction cluster", "Strong setup" |
| "$1,240,500.00 (24,810 sh × $50.00, as filed)" | "Whale is loading up, follow them" |
| "9 Form 4s in 7 days · 52-week weekly average 1.4" | "Unusual activity score 87/100" |
| Member-typed probability → EV arithmetic | Any probability Insidir computed or suggests |
| Delayed quote with timestamp | "Upside", "target", "fair value", "undervalued" |
| Sort by filed time, value, or ticker (member chooses) | Sort by any computed "best" or "top" score |

Form 4 transaction codes are shown as the code letter plus the SEC's description (abbreviated from the Form 4
General Instructions, item 8; the tooltip carries the full text). Store the table once in `lib/sec-research/codes.ts`:

```ts
export const FORM4_CODES = {
  P: "Open market or private purchase",
  S: "Open market or private sale",
  A: "Grant, award or other acquisition",
  D: "Disposition to the issuer",
  F: "Payment of exercise price or tax liability by delivering securities",
  M: "Exercise or conversion of derivative security",
  G: "Bona fide gift",
  C: "Conversion of derivative security",
  X: "Exercise of in-the-money or at-the-money derivative security",
  W: "Acquisition or disposition by will or the laws of descent and distribution",
  J: "Other acquisition or disposition",
} as const;
```

8-K items are shown as the item number plus the SEC title (e.g. `Item 5.02 — Departure of Directors or Certain
Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers`).
Keep the full item table in the same file. No paraphrase, no "what it means".

### §2.2 Vocabulary

Use: **Intelligence, Public records, EDGAR tracking, Filing analysis, Filed, Reported, As filed, Paper trail,
Anomaly (rule match), Watchlist, Journal, Your inputs.**

Never use, in any rendered copy on a `/research` surface: *signal(s) to trade, trade signal, buy/sell signal,
alpha, guaranteed, price target, target price, fair value, upside, downside target, outperform, underperform,
strong buy, conviction, setup, bullish, bearish, you should, we recommend, smart money, follow the insiders.*

The feature the brief calls the "Cluster & Whale Pre-Filtered Alpha Stream" ships as **"Cluster & Whale Stream"**
(nav label "Stream"). "Alpha" implies excess return; it stays out of the UI and marketing even without "guaranteed".

Enforcement: add `RESEARCH_BANNED` to `lib/copy.ts` and a test in `test/compliance.test.ts` that scans
`app/research/**`, `components/sec-research/**` and `lib/sec-research/**` with the same `texts()` extractor the
existing copy test uses. Allow the words only inside `lib/copy.ts` (the list itself) and in comments.

### §2.3 Disclaimers

Add to `lib/copy.ts`:

```ts
/** Under every /research page, in the onboarding modal, under every calculator. docs/RESEARCH-DESK.md §2.3 */
export const RESEARCH_DISCLAIMER =
  "Insidir is research software made by Aethric LLC. It is not a broker, dealer, or registered investment adviser. " +
  "All figures are sourced from public SEC records. Not investment advice.";
/** Next to any figure that is not from the SEC (a delayed quote, a venue price, Wikidata). */
export const NON_SEC_SOURCE = (source: string, asOf: string) => `Source: ${source}, as of ${asOf}. Not an SEC record.`;
/** Under every calculator and the position desk. */
export const CALC_LINE = "Calculated only from the numbers you entered. Insidir does not supply estimates or advice.";
```

Accuracy caveat: the sentence "All figures are sourced from public SEC records" is only true on pages showing SEC
data alone. Every `/research` page that also shows a delayed quote, a member-entered value or Wikidata must put
`NON_SEC_SOURCE(...)` next to those figures (or `CALC_LINE` for member inputs). The prediction-market pages keep the
existing `FOOTER` (their data is venue data, not SEC data). Have counsel confirm this split; a disclaimer that
misstates its own sources is worse than none.

Placement:

| Where | What |
|---|---|
| Footer of every `/research/*` page | `RESEARCH_DISCLAIMER` (a `ResearchFoot` component in the research layout, asserted by the compliance test the same way `<BrandFoot` is today) |
| Onboarding modal (§9.1) | `RESEARCH_DISCLAIMER` + "I understand" checkbox, required, stored in `disclosure_acks` |
| Every calculator / position panel | `CALC_LINE` directly under the result |
| In-app alert drawer footer | `RESEARCH_DISCLAIMER` (short form not allowed) |
| Push and email alerts | Push body has no room: the notification opens the filing page, which carries the footer. Email footer carries the full line. |
| `/disclosures` | Add a "Research" section with the full text and the data-source table from §1.1 |

Version the disclaimer (`RESEARCH_DISCLAIMER_V = 1`). Bumping it re-shows the modal at next visit.

### §2.4 Calculator rule

1. Every input starts empty. No defaults, no placeholders that look like values (placeholder text is a label such
   as "e.g. your price", never a number).
2. Probability fields are always member-typed. Insidir never fills, suggests, or "pre-sets from the market" a
   probability.
3. A public price may be copied into a field only by an explicit click on a "Use last price (delayed, 10:42 ET)"
   button next to it. The click is the member's input; the button shows the source.
4. Results show the formula with the member's numbers substituted ("0.55 × $0.58 − 0.45 × $0.42 − $0.02 = $0.11").
5. No colour coding of results as good/bad (no green "take it"). Positive and negative numbers use the neutral
   number style with a sign.
6. A test renders each calculator and asserts every `<input>` has an empty `value` on first render.

### §2.5 Conflicts in the current product (owner + counsel decision; not changed by this spec)

The guardrails above, applied to what ships today, flag these. They are listed so the owner can decide with
counsel; this spec does not remove them.

| Feature | Where | Conflict with §2.1 |
|---|---|---|
| "Copy" on traders/trackers, one-tap copy, `bet_copies` | `lib/follows.ts` `followLabel`, `app/copies`, `lib/copies` | Mirrors another party's trade: reads as a trade signal |
| Autopilot rules and matches | `app/autopilot`, `lib/autopilot` | Automated rule → "place this" prompts: automated trade signal |
| "Millionaires agree with you" verdicts | `lib/brand/verdict.ts`, `app/check`, `app/read` | Verdict about the member's own position |
| Splits scorecard ("smart money right"), stock splits scored 90 days later on price direction | `lib/smart` | Scores direction calls; "smart money" wording |
| Returns after insider buys vs SPY (README "Insiders, companies and funds") | `lib/stocks/prices.ts` + README | Performance-after-signal framing |
| AI analyst notes, The Read's analyst line, research Q&A | `lib/analyst`, `app/read`, `lib/research` | "Zero AI-generated summaries" |
| Home title "see which side the millionaires bet" | `lib/copy.ts` `WHAT_IS_TITLE` | Follow-the-money framing |

Minimum safe option if these stay: never render any of them inside `/research`, never link from a `/research`
page to them, and keep the research nav separate.

---

## §3 Information architecture

```
/research                    Today: unread alerts, today's Stream, your Watching theses, open positions with new filings
/research/stream             Cluster & Whale Stream (§7)
/research/watchlists         All lists; /research/watchlists/[id] one list (§5)
/research/company/[ticker]   Company report + journal panel (§6) — the hub every other view links into
/research/filing/[accession] One filing: header, lines/items, sec.gov link, "Add note", watchers' journal anchor
/research/journal            Every thesis and note across companies (§6)
/research/positions          Position & paper-trail desk (§8); /research/positions/[id] one position's trail
/research/alerts             Full alert history (the bell's "See all")
/research/settings           Alert channels, quiet hours, export, disclaimer re-read
```

Global chrome on every `/research` page: left rail (desktop) / bottom tabs (phone) with Today, Stream, Watchlists,
Journal, Positions; a ticker search (`⌘K` / tap) that opens a company report; the alert bell with unread count; the
`ResearchFoot` disclaimer.

Access: members only, checked on the server like every paid surface (`lib/billing`). Visitors hitting `/research/*`
see the paywall sheet (`components/brand/Paywall.tsx`) over a static, data-free preview. No SEC data older than
`FREE_DAYS` is sent to a free viewer (same rule as `lib/profiles/sec.ts`).

Every live surface designs four states (BRIEF §9): **live**, **quiet** (nothing new), **stale** (newest SEC poll
older than 5 min: "EDGAR last checked 7 min ago, retrying"), **paused** (poller failing: "EDGAR not reachable,
showing what we have").

---

## §4 Shared foundation: data model

All tables in schema `terminal`. Drizzle definitions below are ready to paste into `lib/db/schema.ts`; generate the
migration with `npm run db:generate` (SQL in §4.3). CIKs are stored without leading zeros, as everywhere else.

### §4.1 Drizzle schema

```ts
/* ───────── Insidir Research (docs/RESEARCH-DESK.md) ───────── */
// Add `bigserial` to the drizzle-orm/pg-core import at the top of lib/db/schema.ts.

/** An SEC registrant we hold filings for, from submissions JSON + company_tickers.json + Wikidata. §4 */
export const issuers = terminal.table("issuers", {
  cik: text("cik").primaryKey(),
  name: text("name").notNull(),
  /** Ticker the UI uses (first listed by EDGAR). Null for issuers with no listed equity. */
  ticker: text("ticker"),
  exchange: text("exchange"),
  sic: text("sic"),
  sicDescription: text("sic_description"),
  fiscalYearEnd: text("fiscal_year_end"),          // "1231"
  wikidataQid: text("wikidata_qid"),
  website: text("website"),
  hq: text("hq"),
  submissionsReadAt: timestamp("submissions_read_at", { withTimezone: true }),
  factsReadAt: timestamp("facts_read_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("issuers_ticker_idx").on(t.ticker)]);

/** company_tickers.json, refreshed daily: every ticker (several per issuer for share classes) → CIK. */
export const issuerTickers = terminal.table("issuer_tickers", {
  ticker: text("ticker").primaryKey(),             // upper-case, "BRK-B"
  cik: text("cik").notNull(),
  title: text("title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("issuer_tickers_cik_idx").on(t.cik)]);

/** Every Form 4, 4/A, 8-K and 8-K/A we detected, whatever its lines. Drives alerts and filing velocity. §5, §7 */
export const secFilings = terminal.table("sec_filings", {
  accession: text("accession").primaryKey(),       // 18 digits, no dashes
  formType: text("form_type").$type<"4" | "4/A" | "8-K" | "8-K/A">().notNull(),
  issuerCik: text("issuer_cik").notNull(),
  issuerName: text("issuer_name").notNull(),
  /** EDGAR's acceptance time (from the Atom entry / index), the clock alerts are measured against. */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  /** When our poller first saw it. detectedAt − acceptedAt is the latency we report on /status. */
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  periodOfReport: text("period_of_report"),        // "YYYY-MM-DD"
  /** 8-K item numbers as filed ("2.02", "9.01"). Empty for Form 4. */
  items: jsonb("items").$type<string[]>().notNull().default([]),
  /** Form 4: distinct transaction codes on the filing ("P","S","M"…), for list filters. */
  codes: jsonb("codes").$type<string[]>().notNull().default([]),
  /** Form 4: reporting owners [{cik,name,role}]. */
  owners: jsonb("owners").$type<Array<{ cik: string; name: string; role: string }>>().notNull().default([]),
  indexUrl: text("index_url").notNull(),
  docUrl: text("doc_url"),
}, t => [
  index("sec_filings_issuer_idx").on(t.issuerCik, t.acceptedAt),
  index("sec_filings_form_idx").on(t.formType, t.acceptedAt),
  index("sec_filings_detected_idx").on(t.detectedAt),
]);

/** Curated XBRL facts as filed (companyfacts), one row per concept/unit/period/accession. §6.4 */
export const xbrlFacts = terminal.table("xbrl_facts", {
  id: serial("id").primaryKey(),
  cik: text("cik").notNull(),
  taxonomy: text("taxonomy").notNull(),            // "us-gaap" | "dei" | "ifrs-full"
  concept: text("concept").notNull(),
  unit: text("unit").notNull(),                    // "USD", "USD/shares", "shares"
  periodStart: text("period_start"),               // null for instant facts
  periodEnd: text("period_end").notNull(),
  fy: integer("fy"),
  fp: text("fp"),                                  // "FY","Q1".."Q4"
  form: text("form").notNull(),                    // "10-K","10-Q"
  accession: text("accession").notNull(),
  filed: text("filed").notNull(),
  value: doublePrecision("value").notNull(),
}, t => [
  uniqueIndex("xbrl_facts_key").on(t.cik, t.taxonomy, t.concept, t.unit, t.periodEnd, t.accession, t.periodStart),
  index("xbrl_facts_cik_idx").on(t.cik, t.concept, t.periodEnd),
]);

/** A rule match from §7: a cluster, a whale purchase, or filing velocity. Idempotent on `key`. */
export const filingAnomalies = terminal.table("filing_anomalies", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),                      // "cluster:<cik>:<anchorDate>" | "whale:<accession>" | "velocity:<cik>:<date>"
  kind: text("kind").$type<"cluster" | "whale" | "velocity">().notNull(),
  issuerCik: text("issuer_cik").notNull(),
  ticker: text("ticker"),
  windowStart: text("window_start").notNull(),     // transaction or filing date, "YYYY-MM-DD"
  windowEnd: text("window_end").notNull(),
  accessions: jsonb("accessions").$type<string[]>().notNull(),
  /** The raw numbers the card prints (owners, codes, shares, prices, values, counts). Never a score. */
  facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
  ruleVersion: integer("rule_version").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("filing_anomalies_key").on(t.key),
  index("filing_anomalies_detected_idx").on(t.detectedAt),
  index("filing_anomalies_issuer_idx").on(t.issuerCik, t.detectedAt),
]);

/** A member's named ticker list. §5 */
export const userWatchlists = terminal.table("user_watchlists", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("user_watchlists_name").on(t.userId, t.name)]);

/** A pinned company in a list. Keyed on CIK so a ticker change never breaks it. */
export const userWatchlistItems = terminal.table("user_watchlist_items", {
  watchlistId: integer("watchlist_id").notNull().references(() => userWatchlists.id, { onDelete: "cascade" }),
  issuerCik: text("issuer_cik").notNull(),
  /** The ticker the member pinned (display only; the share class they chose). */
  ticker: text("ticker").notNull(),
  /** Which forms alert for this company. */
  forms: jsonb("forms").$type<Array<"4" | "8-K">>().notNull().default(["4", "8-K"]),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.watchlistId, t.issuerCik] }), index("user_watchlist_items_cik_idx").on(t.issuerCik)]);

/** The in-app alert feed. One row per member per filing (or anomaly), however many lists hold the company. §5.3 */
export const researchNotifications = terminal.table("research_notifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dedupeKey: text("dedupe_key").notNull(),         // "f:<accession>" | "a:<anomaly id>"
  kind: text("kind").$type<"filing" | "anomaly">().notNull(),
  accession: text("accession"),
  anomalyId: integer("anomaly_id"),
  issuerCik: text("issuer_cik").notNull(),
  /** Pre-rendered, factual title: "AAPL · Form 4 · code S · Cook Timothy D (CEO)". */
  title: text("title").notNull(),
  /** True when the member has an open position in this issuer (§8): drives the "You log a position" chip. */
  held: boolean("held").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
}, t => [
  uniqueIndex("research_notifications_dedupe").on(t.userId, t.dedupeKey),
  index("research_notifications_user_idx").on(t.userId, t.id),
]);

/** A member's status on one company. §6 */
export const researchTheses = terminal.table("research_theses", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuerCik: text("issuer_cik").notNull(),
  status: text("status").$type<"researching" | "watching" | "passed">().notNull(),
  /** Optional one-liner the member writes when choosing Passed. */
  reason: text("reason"),
  statusAt: timestamp("status_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.issuerCik] }), index("research_theses_status_idx").on(t.userId, t.status)]);

/** Every status change, for the thesis timeline. */
export const researchThesisEvents = terminal.table("research_thesis_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuerCik: text("issuer_cik").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("research_thesis_events_idx").on(t.userId, t.issuerCik, t.at)]);

export type NoteAnchorKind = "filing" | "trade" | "xbrl" | "anomaly";
/** A private note beside a company report, optionally pinned to the record it is about. §6 */
export const researchNotes = terminal.table("research_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuerCik: text("issuer_cik").notNull(),
  body: text("body").notNull(),                    // plain text / light markdown, ≤ 20,000 chars
  anchorKind: text("anchor_kind").$type<NoteAnchorKind>(),
  /** accession | "<accession>:<ownerCik>:<line>" | xbrl_facts.id | filing_anomalies.id */
  anchorRef: text("anchor_ref"),
  /** What the anchor showed when the note was written ({label, value, unit, period, url}), so the note keeps its
   *  meaning if the record is amended later. Copied from our own stored data, never from the member. */
  anchorSnapshot: jsonb("anchor_snapshot").$type<Record<string, unknown>>(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete: restorable for 30 days from /research/journal → Trash, then purged by the worker. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [index("research_notes_user_idx").on(t.userId, t.issuerCik, t.createdAt)]);

/** A position the member logs by hand. Insidir never reads a broker or venue account. §8 */
export const researchPositions = terminal.table("research_positions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"equity" | "event_contract">().notNull(),
  /** Equity: the issuer and the ticker typed. */
  issuerCik: text("issuer_cik"),
  ticker: text("ticker"),
  /** Event contract: venue and the contract as the member names it, plus an optional link they paste. */
  venue: text("venue").$type<"kalshi" | "polymarket" | "other">(),
  contractLabel: text("contract_label"),
  contractUrl: text("contract_url"),
  side: text("side").$type<"long" | "short" | "yes" | "no">().notNull(),
  quantity: doublePrecision("quantity").notNull(),  // shares or contracts
  entryPrice: doublePrecision("entry_price").notNull(), // $ per share, or $0.01–$0.99 per contract
  entryDate: text("entry_date").notNull(),
  fees: doublePrecision("fees").notNull().default(0),
  exitPrice: doublePrecision("exit_price"),
  exitDate: text("exit_date"),
  /** Event contract only: how it resolved, entered by the member. */
  resolution: text("resolution").$type<"yes" | "no" | "void">(),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("research_positions_user_idx").on(t.userId, t.status)]);

/** Which companies' paper trails a position maps to. Equity: its own issuer (linkedBy "ticker"). Event contracts:
 *  companies the member links ("user"); a ticker found in the contract label is only offered, never linked unasked. */
export const researchPositionLinks = terminal.table("research_position_links", {
  positionId: integer("position_id").notNull().references(() => researchPositions.id, { onDelete: "cascade" }),
  issuerCik: text("issuer_cik").notNull(),
  linkedBy: text("linked_by").$type<"ticker" | "user">().notNull(),
}, t => [primaryKey({ columns: [t.positionId, t.issuerCik] }), index("research_position_links_cik_idx").on(t.issuerCik)]);

/** Each time a member accepted a disclaimer version, and where. §2.3 */
export const disclosureAcks = terminal.table("disclosure_acks", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  doc: text("doc").$type<"research_disclaimer">().notNull(),
  version: integer("version").notNull(),
  surface: text("surface").$type<"onboarding" | "reaccept">().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.doc, t.version] })]);
```

Member alert settings extend `UserSettings` (no new table):

```ts
research?: {
  push: boolean;          // default false until they enable push on a device
  email: boolean;         // default false
  inApp: true;            // always on; the feed is the product
  anomalies: Array<"cluster" | "whale" | "velocity">; // which Stream kinds alert; default [] (Stream is browsed, not pushed)
  anomaliesWatchlistOnly: boolean; // default true
};
```

Quiet hours reuse `quietStart` / `quietEnd` / `timeZone` and `lib/alerts/quiet.ts`. In-app rows are always written;
quiet hours only hold push and email.

### §4.2 Limits (enforced in the API, shown in the UI when hit)

| Thing | Limit |
|---|---|
| Watchlists per member | 20 |
| Companies per list | 200 |
| Distinct watched companies per member | 500 |
| Note length | 20,000 chars |
| Notes per member | 20,000 |
| Open positions | 500 |
| Notifications kept | 180 days (worker purge), unlimited for ones linked from a note |

### §4.3 Migration SQL (if hand-writing like 0035–0042)

```sql
CREATE TABLE terminal.issuers (
  cik text PRIMARY KEY, name text NOT NULL, ticker text, exchange text, sic text, sic_description text,
  fiscal_year_end text, wikidata_qid text, website text, hq text,
  submissions_read_at timestamptz, facts_read_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX issuers_ticker_idx ON terminal.issuers (ticker);

CREATE TABLE terminal.issuer_tickers (ticker text PRIMARY KEY, cik text NOT NULL, title text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX issuer_tickers_cik_idx ON terminal.issuer_tickers (cik);

CREATE TABLE terminal.sec_filings (
  accession text PRIMARY KEY, form_type text NOT NULL, issuer_cik text NOT NULL, issuer_name text NOT NULL,
  accepted_at timestamptz NOT NULL, detected_at timestamptz NOT NULL DEFAULT now(), period_of_report text,
  items jsonb NOT NULL DEFAULT '[]', codes jsonb NOT NULL DEFAULT '[]', owners jsonb NOT NULL DEFAULT '[]',
  index_url text NOT NULL, doc_url text);
CREATE INDEX sec_filings_issuer_idx ON terminal.sec_filings (issuer_cik, accepted_at);
CREATE INDEX sec_filings_form_idx ON terminal.sec_filings (form_type, accepted_at);
CREATE INDEX sec_filings_detected_idx ON terminal.sec_filings (detected_at);

CREATE TABLE terminal.xbrl_facts (
  id serial PRIMARY KEY, cik text NOT NULL, taxonomy text NOT NULL, concept text NOT NULL, unit text NOT NULL,
  period_start text, period_end text NOT NULL, fy integer, fp text, form text NOT NULL, accession text NOT NULL,
  filed text NOT NULL, value double precision NOT NULL);
CREATE UNIQUE INDEX xbrl_facts_key ON terminal.xbrl_facts (cik, taxonomy, concept, unit, period_end, accession, period_start);
CREATE INDEX xbrl_facts_cik_idx ON terminal.xbrl_facts (cik, concept, period_end);

CREATE TABLE terminal.filing_anomalies (
  id serial PRIMARY KEY, key text NOT NULL, kind text NOT NULL, issuer_cik text NOT NULL, ticker text,
  window_start text NOT NULL, window_end text NOT NULL, accessions jsonb NOT NULL, facts jsonb NOT NULL,
  rule_version integer NOT NULL, detected_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX filing_anomalies_key ON terminal.filing_anomalies (key);
CREATE INDEX filing_anomalies_detected_idx ON terminal.filing_anomalies (detected_at);
CREATE INDEX filing_anomalies_issuer_idx ON terminal.filing_anomalies (issuer_cik, detected_at);

CREATE TABLE terminal.user_watchlists (
  id serial PRIMARY KEY, user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE,
  name text NOT NULL, position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX user_watchlists_name ON terminal.user_watchlists (user_id, name);

CREATE TABLE terminal.user_watchlist_items (
  watchlist_id integer NOT NULL REFERENCES terminal.user_watchlists(id) ON DELETE CASCADE,
  issuer_cik text NOT NULL, ticker text NOT NULL, forms jsonb NOT NULL DEFAULT '["4","8-K"]',
  position integer NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, issuer_cik));
CREATE INDEX user_watchlist_items_cik_idx ON terminal.user_watchlist_items (issuer_cik);

CREATE TABLE terminal.research_notifications (
  id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL, kind text NOT NULL, accession text, anomaly_id integer, issuer_cik text NOT NULL,
  title text NOT NULL, held boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz, pushed_at timestamptz, emailed_at timestamptz);
CREATE UNIQUE INDEX research_notifications_dedupe ON terminal.research_notifications (user_id, dedupe_key);
CREATE INDEX research_notifications_user_idx ON terminal.research_notifications (user_id, id);

CREATE TABLE terminal.research_theses (
  user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE, issuer_cik text NOT NULL,
  status text NOT NULL, reason text, status_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, issuer_cik));
CREATE INDEX research_theses_status_idx ON terminal.research_theses (user_id, status);

CREATE TABLE terminal.research_thesis_events (
  id serial PRIMARY KEY, user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE,
  issuer_cik text NOT NULL, from_status text, to_status text NOT NULL, reason text, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX research_thesis_events_idx ON terminal.research_thesis_events (user_id, issuer_cik, at);

CREATE TABLE terminal.research_notes (
  id serial PRIMARY KEY, user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE,
  issuer_cik text NOT NULL, body text NOT NULL, anchor_kind text, anchor_ref text, anchor_snapshot jsonb,
  pinned boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX research_notes_user_idx ON terminal.research_notes (user_id, issuer_cik, created_at);

CREATE TABLE terminal.research_positions (
  id serial PRIMARY KEY, user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE,
  kind text NOT NULL, issuer_cik text, ticker text, venue text, contract_label text, contract_url text,
  side text NOT NULL, quantity double precision NOT NULL, entry_price double precision NOT NULL, entry_date text NOT NULL,
  fees double precision NOT NULL DEFAULT 0, exit_price double precision, exit_date text, resolution text,
  status text NOT NULL DEFAULT 'open', note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'equity' OR (ticker IS NOT NULL AND side IN ('long','short'))),
  CHECK (kind <> 'event_contract' OR (contract_label IS NOT NULL AND side IN ('yes','no') AND entry_price > 0 AND entry_price < 1)),
  CHECK (quantity > 0));
CREATE INDEX research_positions_user_idx ON terminal.research_positions (user_id, status);

CREATE TABLE terminal.research_position_links (
  position_id integer NOT NULL REFERENCES terminal.research_positions(id) ON DELETE CASCADE,
  issuer_cik text NOT NULL, linked_by text NOT NULL, PRIMARY KEY (position_id, issuer_cik));
CREATE INDEX research_position_links_cik_idx ON terminal.research_position_links (issuer_cik);

CREATE TABLE terminal.disclosure_acks (
  user_id text NOT NULL REFERENCES terminal.users(id) ON DELETE CASCADE, doc text NOT NULL, version integer NOT NULL,
  surface text NOT NULL, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, doc, version));
```

Account deletion (`test/account-delete-db.test.ts`) must cover every new member table; the FK cascades do the work,
`user_watchlist_items` goes through `user_watchlists`, `research_position_links` through `research_positions`.

---

## §5 Feature 1: Watchlists and in-app filing alerts

**Job:** the member pins tickers once; every Form 4 and 8-K for those companies lands in their feed within minutes
of EDGAR accepting it, and they stop checking EDGAR, OpenInsider or a second app.

### §5.1 Ingest pipeline (worker job `research:filings`, every 60 s)

```
EDGAR getcurrent Atom (type=4, type=8-K; pages until an accession already in sec_filings)
  └─ for each new accession:
       1. read the index (Form 4: the XML via the existing readForm4Full; 8-K: index header for ITEM INFORMATION)
       2. upsert sec_filings (acceptedAt from the Atom <updated>/index ACCEPTANCE-DATETIME via easternToMs)
       3. Form 4: upsert insider_trades P/S lines (existing path) → run §7 rules for that issuer
       4. fan-out: SELECT DISTINCT w.user_id FROM user_watchlist_items i JOIN user_watchlists w ...
                   WHERE i.issuer_cik = $1 AND i.forms ? $formFamily
          INSERT INTO research_notifications (...) ON CONFLICT (user_id, dedupe_key) DO NOTHING
          (set held = EXISTS open research_position_links for that user and issuer)
       5. enqueue push/email for rows inserted (respecting settings.research + quiet hours)
```

- One SEC request budget for the whole worker (`SecClient`, 125 ms gap). Two Atom pages a minute plus one or two
  documents per new filing stays well under 10 req/s even at the 4:00–6:00 pm ET Form 4 peak.
- The fan-out is one indexed query per filing; no per-user polling.
- Turn on with `FEATURES_READY` entry `research` (the Coming soon rule in INSIDIR-V2 §2 applies; `stocks` jobs
  must be on too).

**Latency target, stated honestly.** EDGAR publishes to the Atom feed after acceptance, and Form 4s may be
filed up to two business days after the trade. We promise and measure *EDGAR acceptance → in-app*, p95 ≤ 3 min,
reported on `/status` from `detectedAt − acceptedAt`. Every alert row shows both clocks:
"Accepted by EDGAR 4:31:07 pm ET · in Insidir 4:32:15 pm ET · Trade date Oct 14". Copy never says "instant" or
"the exact minute".

### §5.2 Delivery to the open app

- `GET /api/research/notifications?after=<id>` polled every 15 s while the tab is visible (`document.visibilityState`),
  60 s when hidden; returns new rows and `unread`. Cheap: one indexed range scan.
- New rows animate into the bell and raise a toast for 6 s (one toast per poll; 3+ new rows collapse into
  "5 new filings on your watchlists").
- Web push (optional, existing `push_subscriptions`, `lib/alerts/send.ts`) with tag `research:<accession>` so
  devices collapse duplicates. Push body: the factual title only.
- Email (optional): batched at most every 10 minutes per member, factual lines + `RESEARCH_DISCLAIMER`.

### §5.3 Alert row content (factual template, no adjectives)

| Filing | Title | Second line |
|---|---|---|
| Form 4 with P/S lines | `NVDA · Form 4 · S` | `Huang Jen Hsun (CEO) · 120,000 sh @ $138.40 avg · $16,608,000.00 · Trade Oct 14` |
| Form 4, other codes only | `NVDA · Form 4 · M, F` | `Kress Colette (CFO) · 2 lines · Trade Oct 14` |
| Form 4/A | `NVDA · Form 4/A (amendment)` | `Amends 0001045810-26-000123` |
| 8-K | `NVDA · 8-K · Items 2.02, 9.01` | `Results of Operations and Financial Condition; Financial Statements and Exhibits` |
| Anomaly (if enabled) | `NVDA · Cluster: 3 owners, code P` | `Oct 2–Oct 6 · $2,409,920.00 total as filed` |

Avg price for multi-line filings is the value-weighted mean of the filed prices, labelled "avg". Chips: `On: Semis,
Core` (which lists), `You log a position` (when `held`).

### §5.4 UX components

| Component | Purpose | Key props | States / behaviour |
|---|---|---|---|
| `TickerSearch` | Global ⌘K / tap search | `onPick(cik,ticker)` | Typeahead from `issuer_tickers` (prefix on ticker, trigram/ILIKE on title), 8 results, shows ticker · name · exchange; Enter opens company report; `⇧Enter` pins to the current list |
| `PinButton` | Add/remove a company to lists from anywhere (report header, stream card, alert row) | `cik`, `ticker` | Pinned state = filled pin + list count; click opens `ListPicker` popover with checkboxes per list + "New list"; optimistic; toast "Saved" (`SAVED`) |
| `WatchlistRail` | Lists in the left rail | `lists[]`, `activeId` | Drag to reorder; unread dot per list; "New list" inline input |
| `WatchlistTable` | One list | `items[]` | Columns: Ticker · Company · Delayed last (with as-of) · Last Form 4 (date, code) · Last 8-K (date, items) · Thesis status pill · Notes count · Alerts (4 / 8-K toggles). Sort by any column; no computed "score" column. Empty state: "Pin a ticker to start. Every Form 4 and 8-K it files will show up here." with `TickerSearch` focused |
| `AlertBell` | Header bell | `unread` | Badge caps at 99+; opens `AlertDrawer` |
| `AlertDrawer` | Feed panel | rows, filters | Tabs: All · Form 4 · 8-K · Stream; filter by list; "Mark all read"; each row → `/research/filing/[accession]`; secondary action "Add note" opens the journal composer anchored to that filing; footer `RESEARCH_DISCLAIMER` |
| `AlertRow` | One row | `notification` | Unread = left accent bar; shows the two clocks; sec.gov icon link opens the document in a new tab |
| `FreshnessPill` | EDGAR state | `lastPollAt`, `lastError` | live / stale (> 5 min) / paused (errors) per §3 |

### §5.5 API

| Route | Method | Body / query | Returns |
|---|---|---|---|
| `/api/research/tickers` | GET | `q` | `[{ticker,cik,title,exchange}]` (8) |
| `/api/research/watchlists` | GET / POST | — / `{name}` | lists with counts / created list |
| `/api/research/watchlists/[id]` | PATCH / DELETE | `{name?, position?}` | list |
| `/api/research/watchlists/[id]/items` | POST | `{ticker}` (resolved server-side to CIK) | item |
| `/api/research/watchlists/[id]/items/[cik]` | PATCH / DELETE | `{forms?, position?}` | item |
| `/api/research/notifications` | GET | `after`, `before`, `limit≤100`, `kind`, `list` | `{rows, unread}` |
| `/api/research/notifications/read` | POST | `{ids}` or `{all:true}` | `{unread}` |

All `zod`-validated, member-only, `userId` taken from the session (never the body).

---

## §6 Feature 2: Private research journal and thesis tracker

**Job:** the company report is where the member thinks. Their status and notes sit beside the official records they
are about, and build into a research history they come back to every day.

### §6.1 Company report layout (`/research/company/[ticker]`)

```
┌ Header: TICKER · Company name · exchange · SIC description · Delayed last $x (Yahoo, as of 10:42 ET) ┐
│ [Pin]  [Status: Researching ▾]  [Add position]           FreshnessPill                               │
├──────────────────────── Official records (left, 2/3) ─────────────┬── Journal (right, 1/3, sticky) ──┤
│ Tabs: Filings timeline · Insider transactions · Financials (XBRL) │ Status segmented control         │
│       · Stream matches · About (Wikidata)                         │ Status history (collapsible)     │
│                                                                   │ Composer (autosave)              │
│ Every row: date · form/code · figures as filed · sec.gov link     │ Pinned notes                     │
│            · [＋ Note] (anchors the composer to this row)          │ Notes, newest first, with anchor │
│                                                                   │ chips that scroll the left pane  │
└───────────────────────────────────────────────────────────────────┴──────────────────────────────────┘
Footer: RESEARCH_DISCLAIMER; NON_SEC_SOURCE next to the quote and the About tab
```

Phone: the journal becomes a bottom sheet ("Journal · 4 notes") over the records; `＋ Note` opens it anchored.

### §6.2 Thesis status

- Exactly three statuses, member-set only: **Researching**, **Watching**, **Passed**. No default: a company has no
  status until the member picks one (the control shows "Set status").
- Choosing **Passed** offers an optional one-line reason ("Too much dilution in the last 10-Q"), stored on the
  thesis and in the event row.
- Every change writes `research_thesis_events`; the history shows "Researching → Watching · Oct 9 · 'waiting for Q3 10-Q'".
- Status pills use neutral colours (no red/green): Researching = outline, Watching = filled ink, Passed = muted.
- Setting **Watching** offers (does not force) "Also pin to a watchlist?" — the main bridge between §6 and §5.

### §6.3 Notes

- Plain text with light markdown (bold, italics, lists, links). Rendered with an allow-list sanitiser; links get
  `rel="noopener noreferrer nofollow"`.
- Autosave 800 ms after the last keystroke; status text "Saving… / Saved 10:42" (never a spinner that blocks typing).
  Conflicts across tabs: last write wins per note, with `updatedAt` precondition; on 409 show "Edited in another tab
  · Reload".
- Anchors: `＋ Note` on any filing, insider line, XBRL figure or anomaly creates the note with `anchorKind`,
  `anchorRef` and `anchorSnapshot` (label, value, unit, period, sec.gov URL, copied from our tables). The note shows
  the anchor as a chip "Form 4 · S · $16.6M · Oct 14 ↗"; clicking scrolls and highlights the row. If the record was
  amended since, the chip adds "Amended since this note" (compare to a newer 4/A or a newer XBRL fact for the same
  concept/period).
- Pin up to 5 notes per company to the top. Delete = soft delete with "Undo" toast; Trash in `/research/journal`
  keeps them 30 days.
- Notes are private. They are never sent to any model, never used in aggregate, never logged (strip bodies from
  request logs), and never shown to support staff without the member's written request.

### §6.4 Financials tab (XBRL, as filed)

Curated concept list (`lib/sec-research/xbrl.ts`), shown per fiscal period with the concept name visible on hover:

`Revenues` / `RevenueFromContractWithCustomerExcludingAssessedTax`, `NetIncomeLoss`, `EarningsPerShareDiluted`,
`OperatingIncomeLoss`, `CashAndCashEquivalentsAtCarryingValue`, `Assets`, `Liabilities`, `StockholdersEquity`,
`NetCashProvidedByUsedInOperatingActivities`, `PaymentsToAcquirePropertyPlantAndEquipment`,
`WeightedAverageNumberOfDilutedSharesOutstanding`, `dei:EntityCommonStockSharesOutstanding`.

- Table: rows = concepts, columns = last 8 quarters or 5 fiscal years (toggle). Each cell links to its accession.
- When an issuer uses a different revenue concept, show the one it filed and name it; never merge concepts silently.
- Arithmetic we may show, labelled "Computed from filed values": period-over-period change in the same concept
  and unit. No ratios that imply valuation (P/E, EV/EBITDA, "cheap"), no forecasts.

### §6.5 Journal hub (`/research/journal`)

- Board view: three columns (Researching · Watching · Passed), each card = ticker, name, last status change, notes
  count, newest filing since the last note ("2 filings since your last note" — a factual count that drives return
  visits).
- List view: every note across companies, search (Postgres `to_tsvector` over body, per member), filters by status,
  anchor kind, date.
- Export: "Download my research" → JSON (everything), CSV (notes, theses), Markdown (one file per company with notes
  in order and anchor links). See §10 on why export stays.

### §6.6 API

| Route | Method | Body | Notes |
|---|---|---|---|
| `/api/research/company/[ticker]` | GET | — | header, filings page 1, insider lines page 1, xbrl table, anomalies, thesis, notes (one round trip for first paint) |
| `/api/research/theses/[cik]` | PUT | `{status, reason?}` | writes event row in the same transaction |
| `/api/research/theses` | GET | `status?` | board data |
| `/api/research/notes` | GET / POST | `cik`, `q`, cursor / `{cik, body, anchorKind?, anchorRef?}` | server builds `anchorSnapshot` from `anchorRef`; client cannot supply it |
| `/api/research/notes/[id]` | PATCH / DELETE | `{body?, pinned?, ifUpdatedAt}` | 409 on stale `ifUpdatedAt` |
| `/api/research/notes/[id]/restore` | POST | — | from Trash |

---

## §7 Feature 3: Cluster & Whale Stream

**Job:** each morning the member opens one view that already lists every Form 4 pattern matching three published
rules, with the raw lines behind each one. It replaces an hour of scanning screeners.

### §7.1 Rules (rule version 1, `lib/sec-research/rules.ts`, pure functions with unit tests)

Inputs: `insider_trades` rows with `code = 'P'` (non-derivative, acquired, from original Form 4s; 4/A restatements
replace the line they amend) and `sec_filings` rows.

**Cluster.** At one issuer, two or more distinct *owner groups* reported code-P purchases whose transaction dates
fall within 7 calendar days of the episode's first purchase.
- Owner group: reporting owners named on the same accession count as one group (joint filers are usually one
  economic holder: a fund and its general partner). Distinct groups are compared by owner CIK set.
- Episode anchor = the earliest qualifying transaction date not already inside an earlier episode for the issuer;
  the episode covers anchor … anchor + 6 days. Key `cluster:<cik>:<anchorDate>`.
- Qualifies at the second group; later groups in the window update `facts` and `updatedAt` (no new alert).
- A buy filed late (Form 4 allows 2 business days) still joins its episode by transaction date; detection time is
  when the qualifying filing was accepted.

**Whale purchase.** A single accession whose code-P lines sum to ≥ $1,000,000.00 by `filedValue` (shares × price as
filed, exact to the cent). Key `whale:<accession>`. Lines without a reported price are excluded and the card says so.

**Filing velocity.** At one issuer, the count of Form 4 + 4/A accessions accepted in the trailing 7 days is ≥ 5
**and** ≥ 3 × that issuer's mean weekly count over the prior 52 weeks (mean floored at 1.0). Key
`velocity:<cik>:<first day it qualified>`; not re-flagged for the same issuer within 14 days. Shown with the codes
breakdown, because velocity is often grants and option exercises (codes A, M, F), not purchases.

Each rule match stores `facts` with exactly what the card prints. `ruleVersion` is bumped whenever a threshold
changes; old matches keep their version and the card shows "Rule v1".

The rules are a **filter**, not a forecast: the Stream's header says "Form 4 filings that match the three rules
below. A match describes what was filed; it says nothing about what the stock will do." with the three rules
written out in a collapsible "How matches are found".

### §7.2 Stream view (`/research/stream`)

```
Header: "Cluster & Whale Stream" · FreshnessPill · [How matches are found ▾]
Filters: Kind [Cluster][Whale][Velocity] · Roles [CEO][CFO][Director][10% owner][Other officer]
         · Min total $ [___] · Only my watchlists [toggle] · Date range
Sort:    Newest detected (default) · Largest total $ · Ticker A–Z        ← member-chosen, never a score
Day groups: "Today, Nov 6" / "Yesterday" / dates

┌ StreamCard ───────────────────────────────────────────────────────────────────────────────┐
│ CLUSTER · ACME Corp (ACME) · [Pin] [＋ Note]                         Detected 7:02 am ET   │
│ 3 owner groups · code P · trades Oct 2 – Oct 6 · $2,409,920.00 total as filed             │
│ ─ Smith Jane (CEO)       Oct 2   10,000 sh @ $41.20   $412,000.00   Form 4 ↗              │
│ ─ Doe John (Director)    Oct 3   25,000 sh @ $40.00   $1,000,000.00 Form 4 ↗              │
│ ─ Roe Fund LP + Roe GP (10% owner, joint filing) Oct 6  24,000 sh @ $41.58  $997,920.00 ↗  │
│ Rule v1 · Delayed last $43.10 (Yahoo, as of 10:42 ET — not an SEC record)                 │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- WHALE cards: one owner group, every P line on the accession, the total, and "Largest code-P filing by this owner
  on file: $…" only if it is a factual lookup over our stored history (no "biggest ever" unless the history for that
  owner is complete per `sec_history.completeSince`).
- VELOCITY cards: "9 Form 4s accepted Oct 30 – Nov 5 · prior 52-week weekly mean 1.4 · codes: A ×4, M ×3, F ×2"
  and a 52-bar weekly count sparkline (counts only; `components/ui/Sparkline.tsx`).
- No colour coding by kind meaning good/bad. Kinds differ by label and icon only.
- Quiet state: "No filings matched the rules since 6:00 am ET. Last EDGAR check 40 s ago."
- Gating: members see everything live. Visitors see the count of today's matches and a blurred card (`components/lock/Lock.tsx`), consistent with the existing paywall.

### §7.3 Detection job

Runs inside `research:filings` after step 3 for the affected issuer only (cluster, whale), and once a minute over
issuers with a new Form 4 for velocity. Upsert by `key`; insert `research_notifications` for members who opted into
that kind (`settings.research.anomalies`) and, if `anomaliesWatchlistOnly`, watch the issuer.

Backfill: when the job first turns on, run the rules over the last 90 days of `insider_trades` with
`detectedAt = acceptedAt` of the qualifying filing so the Stream is not empty on day one; mark these
`facts.backfilled = true` and never alert on them.

### §7.4 API

`GET /api/research/stream?kind=&roles=&min=&watchlistOnly=&from=&to=&sort=&cursor=` →
`{ cards: StreamCard[], nextCursor }`. `sort` accepts only `detected`, `value`, `ticker`.

---

## §8 Feature 4: Position & paper-trail desk

**Job:** the member logs what they hold by hand (shares or event contracts) and sees, per position, every SEC
record filed for that company since they entered. No broker link, ever.

### §8.1 Logging

`PositionForm` (drawer from "Add position" on any company report, or `/research/positions`):

| Field | Equity | Event contract |
|---|---|---|
| Kind | Equity | Event contract |
| What | Ticker (typeahead → CIK) | Venue (Kalshi / Polymarket / Other) + contract name as you call it + optional link |
| Side | Long / Short | Yes / No |
| Quantity | Shares | Contracts |
| Entry price | $ per share | ¢ per contract (1–99) |
| Entry date | date | date |
| Fees | $ total (optional, empty) | $ total (optional, empty) |
| Linked companies | its own issuer, automatic | "Which companies' filings matter to this contract?" – member picks tickers; tickers spotted in the contract name are offered as one-tap chips, never linked automatically |
| Note | optional | optional |

All fields start empty (§2.4). Close a position: exit price + date (equity) or resolution Yes/No/Void (event).
Optional CSV import of the member's own export (columns mapped by the member), parsed in the request and not kept
beyond the rows created — same stance as the Kalshi CSV today.

### §8.2 Desk view (`/research/positions`)

Table: Kind · What · Side · Qty · Entry · Mark · P&L (arithmetic) · Linked companies · **New filings since entry** ·
Last filing.

- Mark for equity = delayed quote with `NON_SEC_SOURCE`. Event contracts have no mark unless the member types one
  ("Your mark") or clicks "Use last price (Kalshi, delayed, 10:42 ET)" where a public price exists.
- P&L = (mark − entry) × qty × (side sign) − fees; event resolved: (payout − entry) × qty − fees. Formula visible on
  hover. `CALC_LINE` under the table.
- "New filings since entry" is a count chip per form type (`Form 4 ×3 · 8-K ×1`), bold when any are unread.
- No portfolio-level advice, no allocation charts with suggestions, no "risk score". A plain exposure total by
  kind is fine (sum of entry cost the member logged).

### §8.3 Paper trail (`/research/positions/[id]`)

A single vertical timeline from 90 days before the entry date to now, for every linked company:

```
● Entry (you)              Oct 1   Long 200 ACME @ $40.10                         [your record]
● Form 4 · P               Oct 2   Smith Jane (CEO) 10,000 sh @ $41.20            sec.gov ↗ [＋ Note]
● Cluster match            Oct 6   3 owner groups, $2,409,920.00 filed               Stream ↗
● 8-K · Items 5.02         Oct 20  Departure/Election of Directors or Officers…   sec.gov ↗ [＋ Note]
● Note (you)               Oct 21  "CFO leaving — re-read the 10-Q MD&A"           Journal ↗
● Today                    Nov 6   Delayed last $43.10 (Yahoo, 10:42 ET)
```

Member entries and notes are visually distinct (outline dots, "you") from SEC records (filled dots, sec.gov link).

### §8.4 EV calculator (event contracts)

A panel on each event-contract position and standalone at `/research/positions/calculator`.

Inputs (all empty, all required): **Price you pay** (¢), **Your probability estimate** (%), **Contracts**,
**Fees per contract** ($, may be 0 but must be typed). Optional checkbox "Use Kalshi's published taxable fee
formula" which fills the fee field from `lib/fees.ts` using the member's own price and contracts, showing the formula.

Output:

```
Expected value per contract = p × (1 − price) − (1 − p) × price − fee
                            = 0.55 × 0.58 − 0.45 × 0.42 − 0.02 = $0.1100
Total for 100 contracts     = $11.00
Breakeven probability at your price and fee = (price + fee) / 1 = 44.0%
```

Under it: `CALC_LINE` and "The probability is yours. Insidir does not estimate it." The probability field has no
slider default, no "market-implied" helper and no link that fills it.

### §8.5 API

| Route | Method | Notes |
|---|---|---|
| `/api/research/positions` | GET / POST | list with "new filings since entry" counts (one grouped query) / create (validates per §4.3 CHECKs) |
| `/api/research/positions/[id]` | PATCH / DELETE | edit, close, delete |
| `/api/research/positions/[id]/links` | PUT | `{ciks: string[]}` (event contracts) |
| `/api/research/positions/[id]/trail` | GET | merged, ordered timeline items |
| `/api/research/positions/import` | POST | CSV + column map; returns rows created |

---

## §9 User journeys

### §9.1 First visit to /research (onboarding)

1. Member (paid) opens `/research`. No `disclosure_acks` row for the current version → **OnboardingModal**, not
   dismissable by Esc or backdrop.
2. Step 1 "What Insidir Research is": three lines — *Public SEC records, organised. Your lists, notes and positions,
   private to you. No advice, no price targets, no broker connection.* Then the full `RESEARCH_DISCLAIMER` in a
   bordered box, checkbox "I understand Insidir is research software, not investment advice", button **Continue**
   (disabled until checked). On submit: `POST /api/research/ack {version}`.
3. Step 2 "Pin your first tickers": `TickerSearch` with chips for what they pin; "Skip" allowed. Creates list
   "My watchlist".
4. Step 3 "Where alerts go": in-app on (fixed), push toggle (runs the existing device setup, `components/app/PingSetup.tsx`), email toggle.
5. Land on **Today** with the pinned companies' last 30 days of Form 4 / 8-K already in the feed (backfilled,
   marked read) so the first screen is not empty.

### §9.2 Morning routine (the daily habit)

Today page, top to bottom: unread alerts since last visit → Stream matches since 6 pm ET yesterday → Watching
theses with filings since the last note → open positions with new filings. Member opens a Stream card → company
report → reads the Form 4 lines → `＋ Note` on the CEO's line → sets status Researching → pins to "Semis". Total:
under a minute per company, no other tab opened.

### §9.3 The alert moment

4:31:07 pm ET EDGAR accepts an 8-K for a pinned company → 4:32:15 detected → row inserted → open tab picks it up on
its next 15 s poll: bell +1, toast "ACME · 8-K · Items 2.02, 9.01". Push to phone if enabled. Click → filing page:
items with SEC titles, links to the 8-K and EX-99.1 on sec.gov, `＋ Note`, and "You log a position in ACME" chip
linking to the paper trail.

### §9.4 Thesis lifecycle

Researching (notes accumulate, anchored to filings and XBRL cells) → Watching (prompted to pin; alerts now flow) →
new 10-Q lands, the Financials tab updates, the journal hub shows "1 filing since your last note" → member writes a
note, then sets Passed with reason. Six months later the board's Passed column still shows why; reopening sets
Researching again and the history keeps every step.

### §9.5 Position mapping

Member logs "Kalshi: Will ACME report Q4 revenue above $2B? — Yes, 300 @ 41¢", links ACME. The paper trail now
merges ACME's Form 4s and 8-Ks with their entry. When an 8-K Item 2.02 arrives, the alert carries "You log a
position"; the member opens the EV calculator, types their own updated probability and price, and records a note.

### §9.6 Leaving

Cancel flow (existing `cancel_reasons`) shows what they have: "You have 48 notes on 17 companies, 3 lists and 6
positions." with **Download my research** next to the cancel button. After access ends, data is kept 90 days
(re-subscribe restores everything), then deleted; the email before deletion includes the download link.

---

## §10 Retention without hostage-taking

The brief asks for lock-in so members "cannot leave without losing data". The durable version of that is: the
journal, theses, lists and paper trails are worth so much that leaving is costly in *workflow*, while the data itself
stays exportable. Reasons to keep export:

- California's CCPA/CPRA gives consumers a right to a portable copy of personal information for businesses that meet
  its thresholds; other states have similar laws. Withholding notes risks a complaint and a chargeback wave.
- Whop and card-network dispute processes favour merchants who show the customer got what they paid for and could
  take it with them.
- "You keep your notes" is a selling point for the skeptic persona (BRIEF §1).

Lock-in levers that do not trap data: anchors that only resolve inside Insidir (the note chip opens the exact row,
with amendment checks), the status history, "filings since your last note" counts, the position paper trail, and
alerts tuned per company. An export is a static file; the living, cross-linked desk is what they pay for.

---

## §11 Component index (for the build)

`components/sec-research/`:

| Component | Section |
|---|---|
| `ResearchLayout` (rail, tabs, search, bell, `ResearchFoot`) | §3 |
| `ResearchFoot` | §2.3 |
| `OnboardingModal` | §9.1 |
| `FreshnessPill` | §3, §5.4 |
| `TickerSearch`, `PinButton`, `ListPicker` | §5.4 |
| `WatchlistRail`, `WatchlistTable` | §5.4 |
| `AlertBell`, `AlertDrawer`, `AlertRow`, `AlertToast` | §5.4 |
| `CompanyHeader`, `FilingsTimeline`, `InsiderTable`, `XbrlTable`, `AboutPanel` | §6.1, §6.4 |
| `CodeBadge` (letter + SEC description tooltip), `ItemBadge` (8-K item + SEC title) | §2.1 |
| `StatusControl`, `StatusHistory` | §6.2 |
| `NoteComposer`, `NoteCard`, `AnchorChip` | §6.3 |
| `JournalBoard`, `JournalList` | §6.5 |
| `StreamFilters`, `StreamCard`, `RuleExplainer` | §7.2 |
| `PositionForm`, `PositionsTable`, `PaperTrail`, `EvCalculator` | §8 |
| `SourceLine` (wraps `NON_SEC_SOURCE` / `CALC_LINE`) | §2.3 |

Shared rules for all of them: numbers in tabular figures; money as filed to the cent; dates in ET with the zone
shown; every sec.gov link opens in a new tab with `rel="noopener noreferrer"`; colour tokens from BRIEF §3.1; no
red/green semantics on research data; each component has a Skeleton state (`components/ui/Skeleton.tsx`).

`lib/sec-research/`: `codes.ts` (Form 4 codes, 8-K items), `filings.ts` (8-K index parse, `sec_filings` upsert),
`fanout.ts`, `rules.ts` (§7, pure), `xbrl.ts`, `tickers.ts` (company_tickers.json), `wikidata.ts`, `quotes.ts`
(delayed quote cache), `trail.ts` (§8.3 merge), `ev.ts` (§8.4, pure), `export.ts`.

---

## §12 Build plan

Each phase ends with tests green, screenshots of each new page (light/dark, iPhone width), and the compliance test
passing.

| Phase | Ships | Acceptance |
|---|---|---|
| R0 Foundation | Schema + migration; `allowedSecUrl` additions; `issuer_tickers` daily job; `sec_filings` writes from the existing Form 4 path; 8-K Atom + index parse; worker `research:filings` behind `FEATURES_READY=research`; `/status` row with p95 latency | 8-K items parsed for 20 recorded fixtures; p95 detect latency ≤ 3 min over a day in production |
| R1 Disclaimers + shell | `RESEARCH_DISCLAIMER`, `RESEARCH_BANNED`, `ResearchLayout`, `ResearchFoot`, `OnboardingModal`, `disclosure_acks` | Compliance test covers `/research`; modal blocks until acknowledged; version bump re-shows it |
| R2 Watchlists + alerts | §5 complete incl. push/email | E2E: pin ticker → inject a recorded filing into the job → row appears in the open tab ≤ 20 s; dedupe across two lists |
| R3 Company report + journal | §6 incl. XBRL tab, anchors, board, export | Anchor survives a 4/A ("Amended since this note"); export round-trips JSON; note bodies absent from logs |
| R4 Stream | §7 rules, backfill, view, opt-in alerts | Rule unit tests: joint filers count once; late filer joins episode; 4/A replaces line; whale exactly at $1,000,000.00 qualifies, $999,999.99 doesn't; velocity floor |
| R5 Positions | §8 incl. EV calculator, CSV import | Calculator inputs empty on first render (test); P&L arithmetic tests; event-contract links never auto-created |

Tests to add (Vitest, matching `test/` naming): `research-rules.test.ts`, `research-ev.test.ts`,
`research-filings.test.ts` (8-K fixtures), `research-db.test.ts` (fan-out, dedupe, cascades),
`research-compliance.test.ts` (banned words, footer on every page, empty calculator inputs, no sort by score).

---

## §13 Open decisions for the owner

1. §2.5: what happens to Copy, Autopilot, verdicts, splits scoring and AI notes given the new guardrails (counsel).
2. §2.3: confirm the disclaimer split (SEC-only sentence on research pages, `NON_SEC_SOURCE` beside non-SEC
   figures, existing `FOOTER` on prediction-market pages) with counsel.
3. Is Research included in the existing $39 plan for every member, or does it replace the prediction-market
   product's positioning? Pricing copy (`lib/plans.ts`, `/pricing`) follows the answer.
4. Whether to turn on the existing `stocks` worker jobs (needed for R0) and the SEC request budget that implies.
5. Velocity thresholds (5 filings, 3×, 52 weeks) and whale threshold ($1M) are v1; changing them bumps `ruleVersion`.

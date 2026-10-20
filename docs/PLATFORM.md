# Insidir Connections, Changes, Autopilot and Evidence

Navigation: **Home** (Overview, Following, Alerts, Portfolio) · **Explore** (Companies, People, Filings, Research) ·
**Intelligence** (briefing, research questions, 13F). Top navigation only; no sidebar.

## Connections (src/connections.mjs, `GET /v1/entities/<cik>/connections?asOf=&limit=`)

A relationship model built only from structured Form 4 fields, keyed by SEC CIK and accession:

- `reports_at`: an owner named on an issuer's Form 4 or 4/A, with the role filed on the latest of those filings, the
  number of filings and the first and latest filing dates;
- `filed_jointly`: two owners named on the same Form 4.

Each edge carries evidence (the first and latest filing, linked to EDGAR). `asOf` keeps only filings on or before a
date. A missing recent filing is never read as a role ending (Form 4 does not record that). On company, person and
SEC filer pages: a monochrome map (zoom, pan, filters, expand a node to load its own connections, as-of date) and a
table, which is the default view on phones.

## Changes (src/changes.mjs, `GET /v1/entities/<cik>/changes?days=`)

Detected by rules, newest first: new Form 4s (described by transaction code with values as filed, 10b5-1 marks),
amendments (with the date of the filing amended), role changes between an owner's consecutive filings at an issuer,
first filings in Insidir's records (only with 60 days of earlier coverage), financial facts against the same period a
year earlier (`extractFactChanges`: quarter with quarter, fiscal year with fiscal year, balance with balance, latest
filing wins), other EDGAR filings (8-K items, 10-K, 10-Q) and 13F quarter-on-quarter positions (reusing Mirror's
`compareHoldings`). Filings flagged by validation are left out and counted. A model can explain a Form 4 change only
when AI is configured, through the existing cached filing summary.

## Autopilot (sql/021_autopilot.sql, src/notifications.mjs, src/push.mjs)

One-click Follow saves the company (watchlist) or person (followed people) with an alert mode:

| Mode | Behaviour |
| --- | --- |
| Important updates (the Follow button's default) | right away, for purchases, clustered purchases, sales of $1,000,000 or more as filed, and company disclosures |
| All filing updates (existing follows keep this) | right away, for every event |
| Daily / Weekly | collected and shown together at 13:00 UTC, daily or on Mondays (in-app, and in the daily email digest) |
| Off | no alerts; still followed and in the briefing |

Pause stops alerts and keeps the mode. Fan-out runs once per event for all followers, `UNIQUE (user_id, event_id)`
makes it idempotent across restarts and replays, and push uses the same rules. `GET /v1/me/follows`,
`POST /v1/me/follows/settings {kind, id, mode?, paused?}`.

## Plain language and progressive disclosure (src/plain-language.mjs)

One product for every investor: each change and research event carries a `headline` ("Insider share sale
disclosed", "Executive or director change reported", "Revenue 16.4% higher than a year earlier") and a `summary`
sentence (who, what, how much as filed, when traded and filed), above the filing's own terms (`title`, `detail`) and
its evidence. The sentence never drops a qualification to be shorter: a Rule 10b5-1 mark, indirect holdings in the
filer's words ("By Revocable Trust"), an amendment and the date it amends, derivative securities priced per unit, and
a pointer to the footnotes the lines cite. Figures are as filed (prices to four places, values to the cent); a reading
aid such as "$109.4 billion" only ever sits beside the exact figure. Code M is called an option exercise only for
options; restricted and performance stock units "convert into shares". Where they appear:

- company Overview: Latest developments (the four newest changes; Changes holds the rest);
- Changes on company, person and SEC filer pages: headline, sentence, the original filing link, then "Filing detail
  and evidence" with the record as filed, its footnotes and the evidence;
- research events and Alerts: the headline above the event's sentence; alert emails lead each line with it.

Form 4 footnotes (sql/022, PARSER_VERSION 3): each line keeps the ids of the footnotes it cites and the filing keeps
their text. Filings read before version 3 are re-read from EDGAR by the existing queue (src/coverage-ingest.mjs
queueReparse, bounded per run); until then their footnotes are not shown.

## Evidence (src/evidence.mjs)

One shape for every source behind a figure, connection or change: source, record title, entity (name and CIK), filed
date, period (start, end, type), field, value and units, methodology (when derived), and the SEC URL. An item without
an SEC link is not built.

## Systems reused

SEC directory and search (sec-directory.mjs), the Form 4 parser, validation and import queue (sec.mjs,
coverage-ingest.mjs), research events and fan-out (research-events.mjs, notifications.mjs, push.mjs), XBRL extraction
(intelligence.mjs), 13F comparison (intelligence-mirror.mjs), the AI gateway and caches (ai-gateway.mjs, ai-explain.mjs),
the investigation engine (intelligence-investigate.mjs) and the paywall.

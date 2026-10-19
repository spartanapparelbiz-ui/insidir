-- Indexes for the queries every member's pages run (V29 performance pass). Additive only: nothing is dropped or
-- rewritten, and every statement is idempotent (re-run on every start).

-- /v1/transactions (the dashboard's market window): newest trade date first across all companies. Without this the
-- whole table was sorted on every request; with it the planner walks the newest dates and stops at the limit.
CREATE INDEX IF NOT EXISTS sec_transactions_date_idx ON sec_transactions (transaction_date DESC NULLS LAST);

-- Nearly every read filters on parsed filings. /v1/status counts them and takes the newest publication date;
-- /v1/filings and the briefing read them newest first. A partial index holds only parsed rows, in that order.
CREATE INDEX IF NOT EXISTS sec_filings_parsed_published_idx ON sec_filings (published_at DESC NULLS LAST, accession DESC) WHERE ingest_status = 'parsed';

-- Followed people are matched without leading zeros (LTRIM(owner_cik,'0'), see src/api.mjs) on joint filings too;
-- an expression index lets that comparison use an index instead of scanning every owner row.
CREATE INDEX IF NOT EXISTS sec_filing_owners_bare_cik_idx ON sec_filing_owners ((LTRIM(owner_cik, '0')));

-- The public intelligence feed filters and orders by publication date (the existing index is on observed_at).
CREATE INDEX IF NOT EXISTS research_events_published_idx ON research_events (published_at DESC);

-- The AI gateway updates its usage row by cache key after a call.
CREATE INDEX IF NOT EXISTS ai_usage_cache_key_idx ON ai_usage (cache_key) WHERE cache_key IS NOT NULL;

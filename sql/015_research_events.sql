-- Normalized research events (src/research-events.mjs): one row per factual event derived from imported public
-- records, deduplicated by a deterministic key, linked to every source accession and document, with the trade
-- date, the SEC filing time and Insidir's retrieval time kept apart.
CREATE TABLE IF NOT EXISTS research_events (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('insider_purchase','insider_sale','multi_insider_purchase','form4_amendment','company_disclosure')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  superseded_by TEXT,
  issuer_cik TEXT,
  ticker TEXT,
  issuer_name TEXT,
  owner_cik TEXT,
  owner_name TEXT,
  transaction_date DATE,          -- when the reported transaction happened (first, for a group)
  transaction_date_end DATE,      -- last transaction date in the event (groups, multi-day filings)
  filing_date TIMESTAMPTZ,        -- when the SEC published the filing
  ingested_at TIMESTAMPTZ,        -- when Insidir retrieved and parsed it
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when this event row was created
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reporting_lag_days INTEGER,     -- filing date minus transaction date, in calendar days
  accessions TEXT[] NOT NULL,
  source_urls TEXT[] NOT NULL,
  facts JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS research_events_ticker_idx ON research_events(ticker, filing_date DESC);
CREATE INDEX IF NOT EXISTS research_events_issuer_idx ON research_events(issuer_cik, filing_date DESC);
CREATE INDEX IF NOT EXISTS research_events_owner_idx ON research_events(owner_cik, filing_date DESC) WHERE owner_cik IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_events_detected_idx ON research_events(detected_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS research_events_type_idx ON research_events(event_type, filing_date DESC);
CREATE INDEX IF NOT EXISTS research_events_accessions_idx ON research_events USING GIN (accessions);
-- Every person an event is about (joint filings name several), so a follow finds its events by index.
CREATE TABLE IF NOT EXISTS research_event_people (
  event_id BIGINT NOT NULL REFERENCES research_events(id) ON DELETE CASCADE,
  owner_cik TEXT NOT NULL,
  PRIMARY KEY (event_id, owner_cik)
);
CREATE INDEX IF NOT EXISTS research_event_people_owner_idx ON research_event_people(owner_cik, event_id DESC);

-- Where each builder stopped: the retrieval time of the last filing it processed.
CREATE TABLE IF NOT EXISTS research_cursors (
  name TEXT PRIMARY KEY,
  position TIMESTAMPTZ NOT NULL,
  last_key TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company disclosure polling (SEC submissions JSON) for watched companies: when each was last read and how it went.
CREATE TABLE IF NOT EXISTS disclosure_sources (
  issuer_cik TEXT PRIMARY KEY,
  ticker TEXT,
  last_checked_at TIMESTAMPTZ,
  last_ok_at TIMESTAMPTZ,
  baseline_at TIMESTAMPTZ,        -- first successful read: older filings are recorded but never alerted
  failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Failed Form 4 imports are retried with backoff (src/research-events.mjs retryFailedFilings), not only while the
-- filing is still in EDGAR's current feed.
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sec_filings_retry_idx ON sec_filings(next_retry_at) WHERE ingest_status='error';
CREATE INDEX IF NOT EXISTS sec_filings_retrieved_idx ON sec_filings(retrieved_at);

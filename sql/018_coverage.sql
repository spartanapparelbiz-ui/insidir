-- Coverage: one row per SEC filer (CIK) Insidir knows of, every name and ticker it has been seen under, the EDGAR
-- daily form indexes already read, and a durable queue of Form 4 accessions to import (src/sec-directory.mjs,
-- src/coverage-ingest.mjs). Nothing here is deleted by a sync: a CIK that leaves the SEC ticker list is marked
-- unlisted, a ticker that stops appearing keeps its history, a failed accession stays in the queue with its error.

-- Trigram search (typo tolerance, substring matches) when the server allows the extension; pg_trgm is a trusted
-- extension from PostgreSQL 13, so the database owner can create it. Without it search still works by prefix.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%); entity search falls back to prefix matching', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS sec_entities (
  cik TEXT PRIMARY KEY CHECK (cik ~ '^[0-9]{10}$'),
  name TEXT NOT NULL,
  -- company: an issuer, a ticker-list company or an EDGAR operating company; person / organization: a reporting
  -- owner, told apart by the filed name (kind_basis says how each kind was decided); unknown: seen only by name.
  kind TEXT NOT NULL DEFAULT 'unknown' CHECK (kind IN ('company','person','organization','unknown')),
  kind_basis TEXT,
  is_issuer BOOLEAN NOT NULL DEFAULT FALSE,
  is_reporting_owner BOOLEAN NOT NULL DEFAULT FALSE,
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  tickers TEXT[] NOT NULL DEFAULT '{}',
  exchanges TEXT[] NOT NULL DEFAULT '{}',
  sic TEXT,
  sic_description TEXT,
  entity_type TEXT,
  state_of_incorporation TEXT,
  sources TEXT[] NOT NULL DEFAULT '{}',
  issuer_filings INTEGER NOT NULL DEFAULT 0,
  owner_filings INTEGER NOT NULL DEFAULT 0,
  last_filing_at TIMESTAMPTZ,
  last_issuer_cik TEXT,
  last_issuer_name TEXT,
  last_role TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  listed_seen_at TIMESTAMPTZ,
  delisted_at TIMESTAMPTZ,
  profile_refreshed_at TIMESTAMPTZ,
  profile_error TEXT
);
CREATE INDEX IF NOT EXISTS sec_entities_kind_idx ON sec_entities (kind, listed);
CREATE INDEX IF NOT EXISTS sec_entities_owner_idx ON sec_entities (is_reporting_owner) WHERE is_reporting_owner;

CREATE TABLE IF NOT EXISTS sec_entity_names (
  cik TEXT NOT NULL REFERENCES sec_entities(cik) ON DELETE CASCADE,
  name TEXT NOT NULL,
  norm TEXT NOT NULL,
  -- name: the SEC's name for the CIK when seen; former: listed under formerNames; ticker: a trading symbol;
  -- filed: a spelling used on a filing (issuer or reporting-owner name as filed).
  name_kind TEXT NOT NULL CHECK (name_kind IN ('name','former','ticker','filed')),
  source TEXT NOT NULL,
  valid_from DATE,
  valid_to DATE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cik, norm, name_kind)
);
CREATE INDEX IF NOT EXISTS sec_entity_names_prefix_idx ON sec_entity_names (norm text_pattern_ops);
-- The operator class is schema-qualified: the extension may live in a schema that is not on this search_path.
DO $$ DECLARE s TEXT; BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
  IF s IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS sec_entity_names_trgm_idx ON sec_entity_names USING gin (norm %I.gin_trgm_ops)', s);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sec_ticker_history (
  cik TEXT NOT NULL REFERENCES sec_entities(cik) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  exchange TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cik, ticker)
);
CREATE INDEX IF NOT EXISTS sec_ticker_history_ticker_idx ON sec_ticker_history (ticker);

-- One row per EDGAR daily form index read: how many Form 4 / 4/A accessions the SEC listed that day. The
-- authoritative count the local import is reconciled against.
CREATE TABLE IF NOT EXISTS sec_index_days (
  day DATE PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('complete','no_index','error')),
  form4_count INTEGER,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sec_ingest_queue (
  accession TEXT PRIMARY KEY CHECK (accession ~ '^[0-9]{18}$'),
  filer_cik TEXT NOT NULL,
  filer_name TEXT,
  form_type TEXT NOT NULL,
  filed_date DATE,
  -- the EDGAR daily index that listed it (dissemination day; can differ from the filing date after 5:30 pm)
  index_day DATE,
  source TEXT NOT NULL,
  -- pending -> running -> done | retry (back to running after next_attempt_at) | failed (kept, with the error)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sec_ingest_queue_due_idx ON sec_ingest_queue (next_attempt_at) WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS sec_ingest_queue_day_idx ON sec_ingest_queue (index_day, status);

-- Each run of a coverage job, with what it did; the latest successful run per job is the "last sync" users see.
CREATE TABLE IF NOT EXISTS sec_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','error')),
  stats JSONB NOT NULL DEFAULT '{}',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS sec_sync_runs_job_idx ON sec_sync_runs (job, started_at DESC);

CREATE TABLE IF NOT EXISTS sec_sync_state (
  job TEXT PRIMARY KEY,
  cursor_at TIMESTAMPTZ,
  cursor_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reporting-owner lookups by CIK (the people directory, entity resolution) and filings by issuer CIK as text.
CREATE INDEX IF NOT EXISTS sec_filing_owners_cik_idx ON sec_filing_owners (owner_cik);
CREATE INDEX IF NOT EXISTS sec_filings_updated_idx ON sec_filings (updated_at, accession);

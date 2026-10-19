-- Insidir Intelligence: shared AI explanation cache, AI usage ledger, briefing preferences,
-- background job log and Form 13F institutional holdings. Idempotent (re-run on every start).

-- One reusable explanation per (source, content version, explanation type, prompt version, model,
-- language). The cache key is a SHA-256 of those parts; a changed source produces a new content hash
-- and therefore a new key, so stale text is never served for changed evidence. status/lease_until
-- coordinate concurrent requests: one request claims the row, the others read its result.
CREATE TABLE IF NOT EXISTS ai_explanations (
  cache_key CHAR(64) PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('sec_filing','investigation','research_event')),
  source_id TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  explanation_type TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','blocked','failed')),
  text TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 1,
  lease_until TIMESTAMPTZ,
  error TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_explanations_source_idx ON ai_explanations (source_type, source_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_explanations_status_idx ON ai_explanations (status, updated_at DESC);

-- Every call to the AI provider, successful or not. Provider-reported cost is kept apart from cost
-- estimated from configured prices (cost_source), so the admin dashboard never presents a guess as
-- a measurement. user_id is NULL for shared background work.
CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'fast',
  cache_key CHAR(64),
  status TEXT NOT NULL CHECK (status IN ('ok','failed','blocked','timeout','rejected')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  cost_source TEXT NOT NULL DEFAULT 'none' CHECK (cost_source IN ('provider_reported','estimated','none')),
  latency_ms INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage (user_id, created_at DESC);

-- Cache reads, counted per day and feature (one upsert per read, no row per hit).
CREATE TABLE IF NOT EXISTS ai_cache_daily (
  day DATE NOT NULL,
  feature TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature)
);

-- Per-member briefing settings. No row means the defaults: immediate alerts.
CREATE TABLE IF NOT EXISTS intelligence_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'immediate' CHECK (frequency IN ('immediate','daily','weekly')),
  last_visit_at TIMESTAMPTZ,
  previous_visit_at TIMESTAMPTZ,
  last_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Background work (13F ingestion, digests, monitors): one row per run, for the cost dashboard.
CREATE TABLE IF NOT EXISTS intelligence_jobs (
  id BIGSERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed','skipped')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
CREATE INDEX IF NOT EXISTS intelligence_jobs_started_idx ON intelligence_jobs (job, started_at DESC);

-- Form 13F institutional investment managers tracked for Intelligence Mirror. The display name is the
-- one SEC EDGAR gives for the CIK, never a name typed into configuration.
CREATE TABLE IF NOT EXISTS form13f_managers (
  cik TEXT PRIMARY KEY CHECK (cik ~ '^[0-9]{10}$'),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','no_13f','error')),
  last_checked_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per 13F-HR / 13F-HR/A filing. The cover page totals (table_entry_total, table_value_total) are
-- compared with what was parsed from the information table, so incomplete coverage is visible.
CREATE TABLE IF NOT EXISTS form13f_filings (
  accession TEXT PRIMARY KEY CHECK (accession ~ '^[0-9]{18}$'),
  manager_cik TEXT NOT NULL REFERENCES form13f_managers(cik) ON DELETE CASCADE,
  form_type TEXT NOT NULL CHECK (form_type IN ('13F-HR','13F-HR/A')),
  amendment_type TEXT,
  period_of_report DATE NOT NULL,
  filed_at DATE NOT NULL,
  source_url TEXT NOT NULL,
  info_table_url TEXT NOT NULL,
  table_entry_total INTEGER,
  table_value_total NUMERIC(24,2),
  parsed_entries INTEGER NOT NULL,
  parsed_value_total NUMERIC(24,2) NOT NULL,
  value_unit TEXT NOT NULL CHECK (value_unit IN ('dollars','thousands')),
  confidential_omitted BOOLEAN NOT NULL DEFAULT FALSE,
  other_managers_included BOOLEAN NOT NULL DEFAULT FALSE,
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','totals_mismatch','totals_missing')),
  content_hash CHAR(64) NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form13f_filings_manager_idx ON form13f_filings (manager_cik, period_of_report DESC, filed_at DESC);

-- Information-table rows, values normalised to US dollars.
CREATE TABLE IF NOT EXISTS form13f_holdings (
  accession TEXT NOT NULL REFERENCES form13f_filings(accession) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  issuer_name TEXT NOT NULL,
  title_of_class TEXT,
  cusip TEXT NOT NULL,
  value_usd NUMERIC(24,2) NOT NULL,
  shares_or_principal NUMERIC(24,4),
  share_type TEXT,
  put_call TEXT,
  investment_discretion TEXT,
  PRIMARY KEY (accession, row_no)
);
CREATE INDEX IF NOT EXISTS form13f_holdings_cusip_idx ON form13f_holdings (cusip);

-- Lookups the briefing and investigations rely on.
CREATE INDEX IF NOT EXISTS research_events_subject_idx ON research_events (subject, observed_at DESC);
CREATE INDEX IF NOT EXISTS sec_transactions_accession_idx ON sec_transactions (accession);
CREATE INDEX IF NOT EXISTS sec_filings_retrieved_idx ON sec_filings (retrieved_at DESC);
CREATE INDEX IF NOT EXISTS watchlist_ticker_idx ON watchlist (ticker);
CREATE INDEX IF NOT EXISTS push_deliveries_event_idx ON push_deliveries (event_key);

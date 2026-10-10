
CREATE TABLE IF NOT EXISTS sec_filings (
  accession TEXT PRIMARY KEY,
  filer_cik TEXT NOT NULL,
  issuer_cik TEXT,
  issuer_name TEXT,
  ticker TEXT,
  title TEXT NOT NULL,
  form_type TEXT NOT NULL DEFAULT '4',
  published_at TIMESTAMPTZ,
  period_of_report DATE,
  is_amendment BOOLEAN NOT NULL DEFAULT FALSE,
  source_url TEXT NOT NULL,
  xml_url TEXT,
  ingest_status TEXT NOT NULL CHECK(ingest_status IN ('parsed','error','pending')),
  error_message TEXT,
  owner_names TEXT[] NOT NULL DEFAULT '{}',
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sec_filings_published_idx ON sec_filings (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS sec_filings_ticker_idx ON sec_filings (ticker, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS sec_filings_issuer_idx ON sec_filings (issuer_cik, published_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS sec_transactions (
  id TEXT PRIMARY KEY,
  accession TEXT NOT NULL REFERENCES sec_filings(accession) ON DELETE CASCADE,
  issuer_cik TEXT NOT NULL,
  ticker TEXT,
  owner_cik TEXT,
  owner_name TEXT NOT NULL,
  transaction_date DATE,
  security_title TEXT,
  transaction_code TEXT,
  acquired_disposed TEXT,
  category TEXT NOT NULL CHECK(category IN ('reported_purchase','reported_sale','other')),
  derivative BOOLEAN NOT NULL DEFAULT FALSE,
  shares NUMERIC(30,8),
  price_per_share NUMERIC(30,8),
  estimated_value NUMERIC(30,2),
  direct_ownership TEXT,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sec_transactions_issuer_date_idx ON sec_transactions (issuer_cik, transaction_date DESC);
CREATE INDEX IF NOT EXISTS sec_transactions_ticker_date_idx ON sec_transactions (ticker, transaction_date DESC);
CREATE INDEX IF NOT EXISTS sec_transactions_owner_idx ON sec_transactions (owner_cik, transaction_date DESC);
CREATE INDEX IF NOT EXISTS sec_transactions_category_date_idx ON sec_transactions (category, transaction_date DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  discovered INTEGER NOT NULL DEFAULT 0,
  parsed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS ingest_runs_started_idx ON ingest_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,ticker),
  CONSTRAINT ticker_format CHECK(ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$')
);

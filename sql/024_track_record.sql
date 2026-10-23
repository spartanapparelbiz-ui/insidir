-- Insider track record (src/track-record.mjs, docs/INSIDER-EDGE-PLAN.md section 1): how the stock did 1, 3 and 6
-- months after each past open-market buy (code P) and sale (code S), and the hit rate per insider and issuer.
-- Keys are CIKs without leading zeros (the import stores both forms).

-- Daily closes from the market data provider (split-adjusted, as the provider publishes them). One row per trading day.
CREATE TABLE IF NOT EXISTS price_daily (
  ticker TEXT NOT NULL,
  day DATE NOT NULL,
  close NUMERIC(20,6) NOT NULL CHECK (close > 0),
  PRIMARY KEY (ticker, day)
);
-- When each ticker's series was last downloaded, and why it failed if it did.
CREATE TABLE IF NOT EXISTS price_series (
  ticker TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  first_day DATE,
  last_day DATE,
  points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok','empty','error')),
  error TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per trade: an owner's open-market lines at one issuer on one date with one code, at the share-weighted
-- price as filed. ret_* are null until the horizon has passed (or when the provider has no close for it).
CREATE TABLE IF NOT EXISTS insider_trade_outcomes (
  owner_key TEXT NOT NULL,
  issuer_key TEXT NOT NULL,
  trade_date DATE NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('P','S')),
  ticker TEXT,
  owner_name TEXT,
  shares NUMERIC(30,8),
  base_price NUMERIC(30,8),
  base_source TEXT NOT NULL CHECK (base_source IN ('form4','close')),
  value NUMERIC(30,2),
  lines INTEGER NOT NULL DEFAULT 1,
  accession TEXT NOT NULL,
  source_url TEXT NOT NULL,
  filed_on DATE,
  rule_10b5_1 BOOLEAN,
  ret_1m NUMERIC(12,6),
  ret_3m NUMERIC(12,6),
  ret_6m NUMERIC(12,6),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, issuer_key, trade_date, code)
);
CREATE INDEX IF NOT EXISTS insider_trade_outcomes_owner_idx ON insider_trade_outcomes (owner_key, trade_date DESC);

-- The hit rates per owner and issuer (the trade-card line). buys / sells: {"1m": {"n":8,"hits":6,"avg":0.041}, ...,
-- "count": 9} where n counts trades whose horizon has passed.
CREATE TABLE IF NOT EXISTS insider_track_records (
  owner_key TEXT NOT NULL,
  issuer_key TEXT NOT NULL,
  ticker TEXT,
  role TEXT,
  buys JSONB NOT NULL,
  sells JSONB NOT NULL,
  last_trade_date DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, issuer_key)
);

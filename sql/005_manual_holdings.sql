-- User-declared positions: never represented as broker-verified or live market data.
CREATE TABLE IF NOT EXISTS manual_holdings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL CHECK (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  quantity NUMERIC(24,8) NOT NULL CHECK (quantity > 0 AND quantity <= 1000000000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,ticker)
);
CREATE INDEX IF NOT EXISTS manual_holdings_updated_idx ON manual_holdings(user_id,updated_at DESC);

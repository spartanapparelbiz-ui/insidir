-- A private research journal: no trading orders, brokerage credentials or automated execution.
CREATE TABLE IF NOT EXISTS research_decisions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL CHECK (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  review_status TEXT NOT NULL CHECK (review_status IN ('researching','watching','passed')),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ticker)
);
CREATE INDEX IF NOT EXISTS research_decisions_updated_idx ON research_decisions (user_id, updated_at DESC);

-- Growth pieces: stock lookups by ticker (the public /<TICKER> pages), the free weekly email, real testimonials.

-- /<TICKER> resolves a symbol to its company through the SEC ticker list.
CREATE INDEX IF NOT EXISTS sec_entities_tickers_idx ON sec_entities USING GIN (tickers);

-- "The 5 biggest insider buys this week", free (src/newsletter.mjs). Double opt-in: confirmed_at is set when the
-- link in the confirmation email is opened; only confirmed, not unsubscribed addresses get the weekly email.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  token_hash CHAR(64) NOT NULL,
  ref TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_due_idx ON newsletter_subscribers(confirmed_at) WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL;

-- Real quotes from real people, added by hand with their permission. The landing page shows only published rows;
-- with none, it shows no testimonials at all (never a placeholder).
CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  quote TEXT NOT NULL CHECK (length(quote) BETWEEN 10 AND 400),
  name TEXT NOT NULL,
  detail TEXT,
  source_url TEXT,
  permission_note TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

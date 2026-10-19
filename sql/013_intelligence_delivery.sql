-- Opt-in browser and installed-web-app push delivery.
-- No endpoint or device data is shared between accounts.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  UNIQUE(user_id,endpoint),
  CONSTRAINT push_endpoint_length CHECK(length(endpoint) BETWEEN 20 AND 2048)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);

-- Durable deduplication; each user/endpoint/event is delivered at most once
-- unless it explicitly failed and is retried after the backoff.
CREATE TABLE IF NOT EXISTS push_deliveries (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  UNIQUE(subscription_id,event_key)
);
CREATE INDEX IF NOT EXISTS push_deliveries_pending_idx ON push_deliveries(status,last_attempt_at);

-- Source-backed, non-advisory event index from approved feeds. Headline
-- metadata and source URL only; never store copyrighted article text.
CREATE TABLE IF NOT EXISTS research_events (
  event_key TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN ('sec_notice','bluesky_post','politician_disclosure')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  subject TEXT,
  published_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS research_events_latest_idx ON research_events(observed_at DESC);

-- Source-linked AI filing explanations. No user portfolio or brokerage data.
CREATE TABLE IF NOT EXISTS filing_explanations (
 accession TEXT PRIMARY KEY REFERENCES sec_filings(accession) ON DELETE CASCADE,
 explanation TEXT,
 model TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','blocked','failed')),
 retrieved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 error TEXT
);
CREATE INDEX IF NOT EXISTS filing_explanations_status_idx ON filing_explanations(status,updated_at DESC);

-- One-time, operator-authorized, opt-in device broadcasts.
-- A campaign's issue time freezes the audience: new devices registered
-- after the announcement are never retrospectively notified.
CREATE TABLE IF NOT EXISTS push_broadcasts (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 url TEXT NOT NULL DEFAULT '/alerts.html',
 issued_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT push_broadcast_expiry CHECK (expires_at > issued_at)
);

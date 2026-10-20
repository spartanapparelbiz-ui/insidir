-- First-party funnel measurement (src/funnel.mjs). Additive and idempotent.
-- visitor: a random id the browser makes for itself (never an email, IP or fingerprint).
-- user_id: set for engine-recorded events; cleared when the account is deleted.
-- dedupe_key: one row per visitor, day and label for page and click events; one per member for first-time
-- events; one per Stripe object for webhook events.
CREATE TABLE IF NOT EXISTS funnel_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  visitor TEXT CHECK (visitor IS NULL OR visitor ~ '^[a-f0-9]{32}$'),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  label TEXT CHECK (label IS NULL OR length(label) <= 32),
  variant TEXT CHECK (variant IS NULL OR length(variant) <= 49),
  path TEXT CHECK (path IS NULL OR length(path) <= 100),
  referrer TEXT CHECK (referrer IS NULL OR length(referrer) <= 100),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funnel_events_created_idx ON funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_event_idx ON funnel_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_user_idx ON funnel_events (user_id) WHERE user_id IS NOT NULL;

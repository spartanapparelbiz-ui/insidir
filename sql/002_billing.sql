ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
-- True while Stripe will end the subscription at current_period_end. Status stays active until then.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
-- When this row was last written from a Stripe read. An older read must not overwrite a newer one.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_synced_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS stripe_events(event_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT now());

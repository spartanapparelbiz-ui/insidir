-- Express consent to the automatic-renewal terms, as shown and agreed before each checkout (ROSCA; California
-- Bus. & Prof. Code 17602 requires keeping proof of consent for at least three years or one year after the
-- subscription ends, whichever is longer). Rows survive account deletion with the email kept and user_id nulled,
-- because the record proves what the customer agreed to; the privacy policy says so.
CREATE TABLE IF NOT EXISTS billing_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  offer TEXT NOT NULL CHECK (offer IN ('trial','full')),
  amount_today_cents INTEGER NOT NULL CHECK (amount_today_cents >= 0),
  recurring_cents INTEGER NOT NULL CHECK (recurring_cents > 0),
  trial_days INTEGER NOT NULL DEFAULT 0,
  disclosure_version TEXT NOT NULL,
  disclosure_text TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  stripe_checkout_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_consents_user_idx ON billing_consents(user_id, created_at DESC);
-- Billing events worth keeping for disputes and audits: cancellations, refunds, chargebacks, failed payments.
CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  kind TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_customer_idx ON billing_events(stripe_customer_id, created_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
-- Every administrative action (creator partners, commissions) with who, what and from where. Never edited.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);

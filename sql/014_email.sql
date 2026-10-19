-- Outgoing email (src/email.mjs). Every message is written here first and delivered by a worker, so a provider
-- outage delays mail instead of losing it, and the dedupe key makes every send idempotent (a webhook retried by
-- Stripe, or a worker run twice, queues the message once).
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT,
  recipient_hash CHAR(64) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('security','billing','alert','digest')),
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,
  -- Bodies of security mail (they carry one-time links) and alert mail are erased once delivered or abandoned;
  -- billing notices keep theirs as the record of what the customer was told.
  retain_body BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','suppressed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  provider_message_id TEXT,
  -- What the provider reported afterwards (delivered, bounced, complained), from its webhook.
  delivery_status TEXT,
  delivery_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox(next_attempt_at) WHERE status IN ('queued','sending');
CREATE INDEX IF NOT EXISTS email_outbox_user_idx ON email_outbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_outbox_provider_idx ON email_outbox(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Addresses that must not be mailed: hard bounces, spam complaints, provider-side unsubscribes. Keyed by the
-- recipient digest so a deleted account's address is not kept in clear.
CREATE TABLE IF NOT EXISTS email_suppressions (
  recipient_hash CHAR(64) PRIMARY KEY,
  reason TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email-code sign-in (src/email-code.mjs) and first-visit attribution (src/attribution.mjs).

-- One live code per address: a salted SHA-256 of the 6-digit code, 10 minutes, 5 tries. Keyed by the address's digest.
CREATE TABLE IF NOT EXISTS email_codes (
  email_hash CHAR(64) PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  salt CHAR(32) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_codes_expiry_idx ON email_codes(expires_at);

-- The ?ref= a visitor first arrived with (insidirfinance, tiktok, ...), kept on the account and on funnel events.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ref TEXT;
ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS ref TEXT;
CREATE INDEX IF NOT EXISTS funnel_events_ref_idx ON funnel_events(ref, event, created_at) WHERE ref IS NOT NULL;

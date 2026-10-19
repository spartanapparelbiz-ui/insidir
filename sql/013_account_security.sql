-- Account security: email verification, password recovery, distributed rate limits, security events,
-- admin MFA replay protection and worker heartbeats (src/account-security.mjs, src/rate-limit.mjs,
-- src/security-events.mjs, src/admin-auth.mjs, src/ops.mjs).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Single-use tokens sent by email. Only the SHA-256 of a token is stored; the token itself exists only in the
-- email. `email` is the address the token was issued to: a token stops working if the account's email changes.
CREATE TABLE IF NOT EXISTS user_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens(user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS user_tokens_expiry_idx ON user_tokens(expires_at);

-- Fixed-window counters shared by every engine instance. Keys are SHA-256 digests (never raw emails or addresses).
CREATE TABLE IF NOT EXISTS rate_limits (
  key CHAR(64) PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits(reset_at);

-- Security-relevant account events (sign-ins, failures, recovery, verification, deletion, admin access).
-- Emails are kept only as keyed digests; rows are purged after the retention period (src/security-events.mjs).
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_hash CHAR(64),
  kind TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at);

-- Every admin one-time code is accepted once (RFC 6238 replay protection across instances).
-- One row per accepted code, keyed by the secret (a fingerprint, never the secret) and its 30-second step, so a
-- code is accepted once across every instance and a rotated secret starts clean.
CREATE TABLE IF NOT EXISTS admin_otp_used (
  secret_fingerprint TEXT NOT NULL,
  step BIGINT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (secret_fingerprint, step)
);

-- Background workers report each run here, so operators can see what ran, when, and what failed.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  name TEXT PRIMARY KEY,
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_ok_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  last_result JSONB,
  runs BIGINT NOT NULL DEFAULT 0,
  failures BIGINT NOT NULL DEFAULT 0
);

-- Billing webhook health: when Stripe last reached the endpoint (ops monitoring).
ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS event_type TEXT;
CREATE INDEX IF NOT EXISTS stripe_events_processed_idx ON stripe_events(processed_at DESC);

-- Short-lived administrator sessions, opened with the admin token AND a one-time code (src/admin-auth.mjs).
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  actor TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

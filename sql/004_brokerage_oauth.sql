-- Private, encrypted SnapTrade OAuth credentials. Never store brokerage passwords, raw holdings, or trade permissions.
CREATE TABLE IF NOT EXISTS brokerage_oauth_pending (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_hash CHAR(64) NOT NULL,
  verifier_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS brokerage_oauth_pending_expiry_idx ON brokerage_oauth_pending(expires_at);
CREATE TABLE IF NOT EXISTS brokerage_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_encrypted TEXT NOT NULL,
  refresh_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  granted_scope TEXT NOT NULL CHECK (granted_scope = 'read'),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

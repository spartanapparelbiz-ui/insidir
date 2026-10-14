-- Prepared company logos and people photos, stored once and served from this origin.
CREATE TABLE IF NOT EXISTS entity_media (
  sha256 CHAR(64) PRIMARY KEY,
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/webp','image/jpeg','image/svg+xml')),
  bytes BYTEA NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Resolution decisions (which logo/photo was chosen, from where, with what evidence), with expiry.
CREATE TABLE IF NOT EXISTS media_records (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
CREATE INDEX IF NOT EXISTS media_records_expiry_idx ON media_records (expires_at);

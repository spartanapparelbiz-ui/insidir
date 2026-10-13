-- SEC CIK-based follows persist per authenticated account.
CREATE TABLE IF NOT EXISTS followed_people (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_cik TEXT NOT NULL CHECK(owner_cik ~ '^[0-9]{1,12}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,owner_cik)
);
CREATE INDEX IF NOT EXISTS followed_people_created_idx ON followed_people(user_id,created_at DESC);

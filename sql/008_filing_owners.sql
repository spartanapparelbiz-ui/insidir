-- Every reporting owner of every imported Form 4 (one row each, joint filings included), with the
-- relationship boxes as filed. A joint filing's lines are stored once with owner_cik NULL (so market
-- totals count them once); this table attributes them to each owner, so a person who only files
-- jointly has a profile, can be followed and shows up in the followed feed, and roles are read
-- without refetching the XML. Written by persistFiling (src/db.mjs); filings imported before this
-- table existed are filled by scripts/backfill-filing-owners.mjs.
CREATE TABLE IF NOT EXISTS sec_filing_owners (
  accession TEXT NOT NULL REFERENCES sec_filings(accession) ON DELETE CASCADE,
  owner_cik TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  is_director BOOLEAN NOT NULL DEFAULT FALSE,
  is_officer BOOLEAN NOT NULL DEFAULT FALSE,
  officer_title TEXT,
  is_ten_percent_owner BOOLEAN NOT NULL DEFAULT FALSE,
  other_text TEXT,
  PRIMARY KEY (accession, owner_cik)
);
CREATE INDEX IF NOT EXISTS sec_filing_owners_owner_idx ON sec_filing_owners (owner_cik);
-- Joint lines (owner_cik NULL) are found by accession. Partial, so it stays small.
CREATE INDEX IF NOT EXISTS sec_transactions_joint_idx ON sec_transactions (accession) WHERE owner_cik IS NULL;
-- Bookkeeping for scripts/backfill-filing-owners.mjs: every filing the backfill has looked at (owners
-- written, none usable, or failed with the reason), so each run moves on to filings not yet looked at
-- instead of fetching the same ones again; failed ones are retried only with --retry-failed. A filing
-- with owner rows (every import since this table, through persistFiling) never needs a row here.
CREATE TABLE IF NOT EXISTS sec_filing_owners_checked (
  accession TEXT PRIMARY KEY REFERENCES sec_filings(accession) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owners INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

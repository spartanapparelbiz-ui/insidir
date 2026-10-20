-- Form 4 detail the parser now keeps (src/sec.mjs parseOwnership), so every displayed figure can be read against the
-- filing: whether the filer marked a Rule 10b5-1 plan, the date of the filing an amendment amends, and per line the
-- timeliness mark, the nature of indirect ownership and, for derivative lines, the underlying security, its share
-- count, the exercise price and the exercise and expiration dates. Additive only; existing rows keep NULLs until
-- they are re-read (see parser_version below).
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS rule_10b5_1 BOOLEAN;
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS original_filed_on DATE;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS timeliness TEXT CHECK (timeliness IN ('E','L'));
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS nature_of_ownership TEXT;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS exercise_price NUMERIC(30,8);
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS underlying_title TEXT;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS underlying_shares NUMERIC(30,8);
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS exercise_date DATE;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS shares_after NUMERIC(30,8);
-- Which parser version read the filing: rows read by an older version are queued again (src/coverage-ingest.mjs
-- queueReparse) so the detail above fills in from EDGAR without a manual script.
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS parser_version SMALLINT;
CREATE INDEX IF NOT EXISTS sec_filings_parser_version_idx ON sec_filings (parser_version) WHERE ingest_status='parsed';
-- The checks run on each parsed filing (src/sec.mjs validateOwnership): valid, warnings, or flagged (an error; the
-- filing is kept and shown with its issues but never becomes an alert).
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS validation_status TEXT CHECK (validation_status IN ('valid','warnings','flagged'));
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS validation_issues JSONB;

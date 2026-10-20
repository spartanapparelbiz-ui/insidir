-- Form 4 footnotes (src/sec.mjs parseOwnership, PARSER_VERSION 3). A footnote can change how a line reads (shares
-- acquired from the reporting person's own trusts, a weighted-average price, a plan adoption date), so each line
-- keeps the ids of the footnotes attached to it and the filing keeps their text, shown with the line as filed.
-- Additive only; older rows keep NULLs until the re-read queue (src/coverage-ingest.mjs queueReparse) reaches them.
ALTER TABLE sec_filings ADD COLUMN IF NOT EXISTS footnotes JSONB;
ALTER TABLE sec_transactions ADD COLUMN IF NOT EXISTS footnote_ids TEXT[];

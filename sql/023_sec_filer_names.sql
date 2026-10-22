-- Every name in the SEC's list of EDGAR filers (https://www.sec.gov/Archives/edgar/cik-lookup-data.txt, about a
-- million CIKs): search finds any company, person or fund that has ever filed, not only those Insidir has already met.
-- Names only; a filer gets its full directory row (sec_entities) when someone opens it. Refreshed weekly
-- (src/sec-directory.mjs syncFilerList). Additive.
CREATE TABLE IF NOT EXISTS sec_filer_names (
  cik TEXT NOT NULL,
  name TEXT NOT NULL,
  norm TEXT NOT NULL,
  PRIMARY KEY (cik, norm)
);
DO $$ DECLARE s TEXT; BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
  IF s IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS sec_filer_names_trgm_idx ON sec_filer_names USING gin (norm %I.gin_trgm_ops)', s);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS sec_filer_names_prefix_idx ON sec_filer_names (norm text_pattern_ops);

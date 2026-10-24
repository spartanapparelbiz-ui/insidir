-- The SEC filing itself, kept so Insidir can show it in the app (src/filing-document.mjs): the ownership document's XML
-- exactly as fetched from www.sec.gov, once per filing. The original stays linked on every view.
CREATE TABLE IF NOT EXISTS sec_documents (
  accession TEXT PRIMARY KEY REFERENCES sec_filings(accession) ON DELETE CASCADE,
  xml_url TEXT NOT NULL,
  xml TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Filings (lib/filings, docs/RESEARCH-DESK.md): SEC Form 4 / 8-K stored once for every member, the Cluster & Whale
-- Stream computed at ingestion, the SEC ticker directory, and three small per-member tables.
CREATE TABLE IF NOT EXISTS "terminal"."sec_filings" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "accession" text NOT NULL,
  "form" text NOT NULL,
  "issuer_cik" text NOT NULL,
  "ticker" text,
  "company" text NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "filed_on" text NOT NULL,
  "url" text NOT NULL,
  "payload" jsonb NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sec_filings_accession" ON "terminal"."sec_filings" USING btree ("accession");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_filings_issuer_idx" ON "terminal"."sec_filings" USING btree ("issuer_cik","accepted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_filings_ticker_idx" ON "terminal"."sec_filings" USING btree ("ticker","filed_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_filings_filed_idx" ON "terminal"."sec_filings" USING btree ("filed_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."filing_anomalies" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "kind" text NOT NULL,
  "issuer_cik" text NOT NULL,
  "ticker" text,
  "company" text NOT NULL,
  "window_start" text NOT NULL,
  "window_end" text NOT NULL,
  "total" double precision,
  "facts" jsonb NOT NULL,
  "rule_version" integer NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "filing_anomalies_key" ON "terminal"."filing_anomalies" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_anomalies_detected_idx" ON "terminal"."filing_anomalies" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_anomalies_ticker_idx" ON "terminal"."filing_anomalies" USING btree ("ticker");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."issuer_tickers" (
  "ticker" text PRIMARY KEY NOT NULL,
  "cik" text NOT NULL,
  "title" text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issuer_tickers_cik_idx" ON "terminal"."issuer_tickers" USING btree ("cik");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."user_watchlists" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_watchlists_user_idx" ON "terminal"."user_watchlists" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."research_journal" (
  "user_id" text NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "issuer_cik" text NOT NULL,
  "ticker" text NOT NULL,
  "status" text,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_journal_user_id_issuer_cik_pk" PRIMARY KEY("user_id","issuer_cik")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_journal_user_idx" ON "terminal"."research_journal" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."research_members" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "seen_id" bigint DEFAULT 0 NOT NULL,
  "ack_version" integer,
  "ack_at" timestamp with time zone,
  "positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "positions_version" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

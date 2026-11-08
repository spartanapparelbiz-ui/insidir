-- docs/INSIDIR-V3.md §3 steps 3–6: company reports, People (Forms 3 and 5), watchlists and alerts, the research journal.
CREATE TABLE IF NOT EXISTS "terminal"."companies" (
  "cik" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "tickers" text[] DEFAULT '{}'::text[] NOT NULL,
  "exchanges" text[] DEFAULT '{}'::text[] NOT NULL,
  "sic" text,
  "sic_description" text,
  "fiscal_year_end" text,
  "state_of_incorporation" text,
  "category" text,
  "wanted_at" timestamp with time zone,
  "refreshed_at" timestamp with time zone,
  "facts_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_wanted_idx" ON "terminal"."companies" USING btree ("wanted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_tickers_idx" ON "terminal"."companies" USING gin ("tickers");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."company_facts" (
  "cik" text NOT NULL,
  "concept" text NOT NULL,
  "unit" text NOT NULL,
  "start" text NOT NULL,
  "end" text NOT NULL,
  "value" double precision NOT NULL,
  "accn" text NOT NULL,
  "form" text NOT NULL,
  "fy" integer,
  "fp" text,
  "filed" text NOT NULL,
  CONSTRAINT "company_facts_pk" PRIMARY KEY ("cik","concept","unit","start","end","accn")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_facts_cik_idx" ON "terminal"."company_facts" USING btree ("cik","concept");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."company_filings" (
  "accession" text PRIMARY KEY NOT NULL,
  "cik" text NOT NULL,
  "form" text NOT NULL,
  "filed_on" text NOT NULL,
  "accepted_at" timestamp with time zone,
  "report_date" text,
  "items" text,
  "description" text,
  "url" text NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_filings_cik_idx" ON "terminal"."company_filings" USING btree ("cik","filed_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_filings_seen_idx" ON "terminal"."company_filings" USING btree ("seen_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."sec_watchlists" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "forms" text[] DEFAULT '{ownership}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_watchlists_user_idx" ON "terminal"."sec_watchlists" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."sec_watchlist_items" (
  "watchlist_id" integer NOT NULL REFERENCES "terminal"."sec_watchlists"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "cik" text NOT NULL,
  "label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sec_watchlist_items_pk" PRIMARY KEY ("watchlist_id","kind","cik")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_watchlist_items_cik_idx" ON "terminal"."sec_watchlist_items" USING btree ("kind","cik");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."sec_alerts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "accession" text NOT NULL,
  "form" text NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "latency_ms" integer,
  "read_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sec_alerts_user_accession_idx" ON "terminal"."sec_alerts" USING btree ("user_id","accession");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_alerts_user_idx" ON "terminal"."sec_alerts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."journal_entries" (
  "user_id" text NOT NULL REFERENCES "terminal"."users"("id") ON DELETE cascade,
  "cik" text NOT NULL,
  "status" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "journal_entries_pk" PRIMARY KEY ("user_id","cik")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_owners_idx" ON "terminal"."filings" USING gin ("owners" jsonb_path_ops);--> statement-breakpoint
-- Forms 3 and 5 are read from now on: days the backfill had finished are listed again; Form 4s already read are skipped.
UPDATE "terminal"."form4_days" SET "listed" = NULL, "pending" = '[]'::jsonb, "done_at" = NULL WHERE "done_at" IS NOT NULL AND "listed" > 0;

-- docs/INSIDIR-V3.md §4: every Form 4 transaction code, amendments, the filings table and the daily-index backfill.
ALTER TABLE "terminal"."insider_trades" ALTER COLUMN "shares" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "form" text DEFAULT '4' NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "acquired_disposed" text;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "derivative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "security" text;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "owned_after" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "direct" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "plan_10b5_1" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "is_director" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "is_officer" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "is_ten_percent" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "officer_title" text;--> statement-breakpoint
ALTER TABLE "terminal"."insider_trades" ADD COLUMN IF NOT EXISTS "superseded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insider_trades_code_idx" ON "terminal"."insider_trades" USING btree ("code","filed_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."filings" (
  "accession" text PRIMARY KEY NOT NULL,
  "form" text NOT NULL,
  "issuer_cik" text NOT NULL,
  "company" text NOT NULL,
  "ticker" text,
  "owners" jsonb NOT NULL,
  "owner_key" text NOT NULL,
  "period" text,
  "filed_at" timestamp with time zone NOT NULL,
  "url" text NOT NULL,
  "lines" integer NOT NULL,
  "plan_10b5_1" boolean,
  "original_date" text,
  "amends" text,
  "superseded_by" text,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_filed_idx" ON "terminal"."filings" USING btree ("filed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_issuer_idx" ON "terminal"."filings" USING btree ("issuer_cik","filed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_ticker_idx" ON "terminal"."filings" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_group_idx" ON "terminal"."filings" USING btree ("issuer_cik","owner_key","period");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."form4_days" (
  "day" text PRIMARY KEY NOT NULL,
  "listed" integer,
  "pending" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "failed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "done_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

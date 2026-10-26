CREATE TABLE "terminal"."gap_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"market_keys" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."match_candidates" (
	"key" text PRIMARY KEY NOT NULL,
	"a_id" text NOT NULL,
	"b_venue" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."match_keys" (
	"venue" text NOT NULL,
	"market_id" text NOT NULL,
	"key" text NOT NULL,
	"day" integer,
	CONSTRAINT "match_keys_venue_market_id_key_pk" PRIMARY KEY("venue","market_id","key")
);
--> statement-breakpoint
CREATE TABLE "terminal"."match_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "terminal"."quarantined_deals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."markets" ADD COLUMN "fp" text;--> statement-breakpoint
ALTER TABLE "terminal"."markets" ADD COLUMN "seen_run" integer;--> statement-breakpoint
CREATE INDEX "match_candidates_a_idx" ON "terminal"."match_candidates" USING btree ("a_id","b_venue");--> statement-breakpoint
CREATE INDEX "match_keys_key_idx" ON "terminal"."match_keys" USING btree ("key","venue","day");--> statement-breakpoint
CREATE INDEX "quarantine_seen_idx" ON "terminal"."quarantined_deals" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "markets_seen_run_idx" ON "terminal"."markets" USING btree ("venue","seen_run");
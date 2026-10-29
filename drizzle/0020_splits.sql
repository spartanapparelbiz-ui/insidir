CREATE TABLE "terminal"."cusip_tickers" (
	"cusip" text PRIMARY KEY NOT NULL,
	"ticker" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."splits" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"subject" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"tab" text NOT NULL,
	"league" text,
	"crowd" double precision,
	"smart" double precision,
	"gap" double precision NOT NULL,
	"smart_side" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"live" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"flagged_at" timestamp with time zone,
	"flagged_crowd" double precision,
	"flagged_smart" double precision,
	"flagged_gap" double precision,
	"outcome" text,
	"smart_right" boolean,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terminal"."trader_open" (
	"wallet" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome_index" integer NOT NULL,
	"outcome" text,
	"title" text NOT NULL,
	"size" double precision NOT NULL,
	"avg_price" double precision,
	"money_in" double precision NOT NULL,
	"cur_price" double precision,
	"end_date" timestamp with time zone,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trader_open_wallet_market_id_outcome_index_pk" PRIMARY KEY("wallet","market_id","outcome_index")
);
--> statement-breakpoint
CREATE TABLE "terminal"."trader_open_read" (
	"wallet" text PRIMARY KEY NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."trader_records" ADD COLUMN "avg_price" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."trader_records" ADD COLUMN "proven" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "splits_kind_subject_idx" ON "terminal"."splits" USING btree ("kind","subject");--> statement-breakpoint
CREATE INDEX "splits_live_gap_idx" ON "terminal"."splits" USING btree ("live","gap");--> statement-breakpoint
CREATE INDEX "splits_flagged_idx" ON "terminal"."splits" USING btree ("flagged_at");--> statement-breakpoint
CREATE INDEX "trader_open_market_idx" ON "terminal"."trader_open" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "trader_records_proven_idx" ON "terminal"."trader_records" USING btree ("proven");
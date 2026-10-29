CREATE TABLE "terminal"."market_info" (
	"source" text NOT NULL,
	"market_id" text NOT NULL,
	"yes_price" double precision,
	"start_at" timestamp with time zone,
	"closed" boolean DEFAULT false NOT NULL,
	"history_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_info_source_market_id_pk" PRIMARY KEY("source","market_id")
);
--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "trackers" text[];--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "trackers_v" integer;--> statement-breakpoint
CREATE INDEX "moves_trackers_idx" ON "terminal"."moves" USING gin ("trackers");--> statement-breakpoint
CREATE INDEX "moves_trackers_v_idx" ON "terminal"."moves" USING btree ("trackers_v");
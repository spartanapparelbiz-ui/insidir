CREATE TABLE "terminal"."position_events" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"tier" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome_side" text NOT NULL,
	"outcome" text NOT NULL,
	"market_title" text NOT NULL,
	"event_title" text NOT NULL,
	"category" text NOT NULL,
	"url" text,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"price" double precision NOT NULL,
	"shares" double precision NOT NULL,
	"held_after" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "position_events_pos_idx" ON "terminal"."position_events" USING btree ("wallet","market_id","outcome_side","at");--> statement-breakpoint
CREATE INDEX "position_events_at_idx" ON "terminal"."position_events" USING btree ("at");--> statement-breakpoint
CREATE TABLE "terminal"."kalshi_pings" (
	"event_id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"kalshi_id" text NOT NULL,
	"outcome_side" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"outcome" text NOT NULL,
	"category" text NOT NULL,
	"poly_price" double precision NOT NULL,
	"kalshi_price" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kalshi_pings_at_idx" ON "terminal"."kalshi_pings" USING btree ("at");

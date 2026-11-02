CREATE TABLE "terminal"."millionaire_bets" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"tier" text NOT NULL,
	"source" text NOT NULL,
	"market_id" text NOT NULL,
	"event_title" text NOT NULL,
	"market_title" text NOT NULL,
	"outcome" text NOT NULL,
	"outcome_side" text NOT NULL,
	"amount" double precision NOT NULL,
	"price" double precision NOT NULL,
	"category" text NOT NULL,
	"url" text,
	"at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"result" text,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terminal"."watchlist" (
	"wallet" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"pnl" double precision NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "millionaire_bets_at_idx" ON "terminal"."millionaire_bets" USING btree ("at");--> statement-breakpoint
CREATE INDEX "millionaire_bets_category_at_idx" ON "terminal"."millionaire_bets" USING btree ("category","at");--> statement-breakpoint
CREATE INDEX "millionaire_bets_market_idx" ON "terminal"."millionaire_bets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "millionaire_bets_wallet_idx" ON "terminal"."millionaire_bets" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "watchlist_tier_idx" ON "terminal"."watchlist" USING btree ("tier");
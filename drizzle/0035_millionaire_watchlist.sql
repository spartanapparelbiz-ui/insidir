CREATE TABLE "terminal"."millionaire_bets" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"market_id" text NOT NULL,
	"event_title" text,
	"market_title" text NOT NULL,
	"outcome" text,
	"outcome_side" text NOT NULL,
	"amount" double precision NOT NULL,
	"price" double precision NOT NULL,
	"pnl" double precision NOT NULL,
	"tab" text,
	"league" text,
	"category" text,
	"at" timestamp with time zone NOT NULL,
	"result" text,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terminal"."millionaire_wallets" (
	"wallet" text PRIMARY KEY NOT NULL,
	"pnl" double precision NOT NULL,
	"source" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "millionaire_bets_at_idx" ON "terminal"."millionaire_bets" USING btree ("at");--> statement-breakpoint
CREATE INDEX "millionaire_bets_market_idx" ON "terminal"."millionaire_bets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "millionaire_bets_wallet_idx" ON "terminal"."millionaire_bets" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "millionaire_wallets_pnl_idx" ON "terminal"."millionaire_wallets" USING btree ("pnl");
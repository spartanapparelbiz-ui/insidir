-- The AI analyst (lib/briefing, lib/watch, lib/brief): Bet Briefings cached by market, side and position; positions a
-- member asked Insidir to watch; and "What we told you", every briefing, alert and brief line shown, with how it
-- turned out. Add-only.
CREATE TABLE IF NOT EXISTS "terminal"."briefings" (
  "key" text PRIMARY KEY NOT NULL,
  "market_id" text NOT NULL,
  "side" text,
  "position_hash" text NOT NULL,
  "price" double precision,
  "facts" jsonb NOT NULL,
  "sections" jsonb NOT NULL,
  "origin" text NOT NULL,
  "model" text,
  "cost_usd" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefings_market_idx" ON "terminal"."briefings" ("market_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."watched_bets" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "market_id" text NOT NULL,
  "market_title" text NOT NULL,
  "category" text,
  "side" text NOT NULL,
  "outcome" text NOT NULL,
  "price" double precision NOT NULL,
  "amount" double precision NOT NULL,
  "shares" double precision NOT NULL,
  "origin" text NOT NULL DEFAULT 'manual',
  "address" text,
  "last_price" double precision,
  "checked_at" timestamp with time zone,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" text,
  "settled_at" timestamp with time zone,
  "removed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watched_bets_user_idx" ON "terminal"."watched_bets" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watched_bets_open_idx" ON "terminal"."watched_bets" ("market_id") WHERE "result" IS NULL AND "removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watched_bets_address_idx" ON "terminal"."watched_bets" ("user_id", "address", "market_id", "side") WHERE "address" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."told_log" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "kind" text NOT NULL,
  "market_id" text,
  "market_title" text,
  "side" text,
  "price" double precision,
  "headline" text NOT NULL,
  "body" text,
  "facts" jsonb,
  "watch_id" text,
  "result" text,
  "settled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "told_log_user_idx" ON "terminal"."told_log" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "told_log_market_idx" ON "terminal"."told_log" ("market_id") WHERE "result" IS NULL;

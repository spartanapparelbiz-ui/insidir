CREATE TABLE IF NOT EXISTS "terminal"."autopilot_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "starter" text,
  "active" boolean DEFAULT true NOT NULL,
  "spec" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopilot_rules_user_idx" ON "terminal"."autopilot_rules" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopilot_rules_active_idx" ON "terminal"."autopilot_rules" ("active");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."autopilot_matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "rule_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "event_id" text NOT NULL,
  "status" text NOT NULL,
  "reason" text,
  "wallet" text NOT NULL,
  "market_id" text NOT NULL,
  "kalshi_id" text NOT NULL,
  "kalshi_url" text NOT NULL,
  "side" text NOT NULL,
  "outcome" text NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "amount" double precision NOT NULL,
  "their_price" double precision NOT NULL,
  "ask" double precision,
  "limit_price" double precision,
  "contracts" integer,
  "stake" double precision,
  "paper_entry" double precision,
  "trade_at" timestamp with time zone NOT NULL,
  "matched_at" timestamp with time zone NOT NULL,
  "latency_ms" integer NOT NULL,
  "exit_event_id" text,
  "exit_at" timestamp with time zone,
  "exit_price" double precision,
  "result" text,
  "settled_at" timestamp with time zone,
  "member_status" text,
  "fill_price" double precision
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "autopilot_matches_rule_event" ON "terminal"."autopilot_matches" ("rule_id","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopilot_matches_user_idx" ON "terminal"."autopilot_matches" ("user_id","matched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopilot_matches_market_idx" ON "terminal"."autopilot_matches" ("market_id","side");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."autopilot_backtests" (
  "key" text PRIMARY KEY NOT NULL,
  "result" jsonb NOT NULL,
  "computed_at" timestamp with time zone NOT NULL
);

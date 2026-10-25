CREATE SCHEMA IF NOT EXISTS "terminal";
--> statement-breakpoint
CREATE TABLE "terminal"."alerts_sent" (
	"user_id" text NOT NULL,
	"opp_id" text NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	CONSTRAINT "alerts_sent_user_id_opp_id_channel_pk" PRIMARY KEY("user_id","opp_id","channel")
);
--> statement-breakpoint
CREATE TABLE "terminal"."events" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"variant" text,
	"props" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."llm_usage" (
	"month" text PRIMARY KEY NOT NULL,
	"usd" double precision DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."markets" (
	"venue" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_venue_id_pk" PRIMARY KEY("venue","id")
);
--> statement-breakpoint
CREATE TABLE "terminal"."match_decisions" (
	"key" text PRIMARY KEY NOT NULL,
	"decision" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."match_overrides" (
	"key" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"inverted" boolean DEFAULT false NOT NULL,
	"safety" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"venues" text[] NOT NULL,
	"safety" text NOT NULL,
	"roi" double precision NOT NULL,
	"profit_per_day" double precision NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"safety" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "terminal"."receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"opp_id" text NOT NULL,
	"kind" text NOT NULL,
	"safety" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	"settled_at" timestamp with time zone,
	"results" jsonb,
	"same_way" boolean,
	"realized_profit" double precision
);
--> statement-breakpoint
CREATE TABLE "terminal"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"username" text,
	"region" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"membership_id" text,
	"manage_url" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"plan_checked_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{"minRoi":0.005,"minSizeUsd":0,"categories":[],"venues":["kalshi","polymarket","polymarket_us"],"showYellow":true,"showRed":false,"alertPush":false,"alertEmail":false,"emailDigest":false,"alertMinRoi":0.01}'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"last_digest_at" timestamp with time zone,
	"visitor_id" text,
	"utm" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."whale_trades" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."worker_heartbeats" (
	"job" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"stats" jsonb
);
--> statement-breakpoint
ALTER TABLE "terminal"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "terminal"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "terminal"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_at_idx" ON "terminal"."events" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "events_visitor_idx" ON "terminal"."events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "opps_active_idx" ON "terminal"."opportunities" USING btree ("active","profit_per_day");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_opp_idx" ON "terminal"."receipts" USING btree ("opp_id");--> statement-breakpoint
CREATE INDEX "receipts_detected_idx" ON "terminal"."receipts" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "terminal"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "whales_at_idx" ON "terminal"."whale_trades" USING btree ("at");
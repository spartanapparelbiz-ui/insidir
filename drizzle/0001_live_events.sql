CREATE TABLE "terminal"."live_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"opp_id" text,
	"venues" text[] NOT NULL,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."users" ALTER COLUMN "settings" SET DEFAULT '{"minRoi":0.005,"minSizeUsd":0,"categories":[],"venues":["kalshi","polymarket","polymarket_us"],"showYellow":true,"showRed":false,"alertPush":false,"alertEmail":false,"emailDigest":false,"alertMinRoi":0.01,"soundOnGreen":false}'::jsonb;--> statement-breakpoint
CREATE INDEX "live_events_at_idx" ON "terminal"."live_events" USING btree ("at");
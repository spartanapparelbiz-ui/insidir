CREATE TABLE "terminal"."quarantined_deals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."users" ALTER COLUMN "settings" SET DEFAULT '{"minRoi":0.005,"minSizeUsd":0,"categories":[],"venues":["kalshi","polymarket","polymarket_us"],"showYellow":true,"showRed":false,"alertPush":false,"alertEmail":false,"emailDigest":false,"alertMinRoi":0.01,"soundOnGreen":false,"alertSafety":"green","alertCategories":[],"quietStart":null,"quietEnd":null,"timeZone":null}'::jsonb;--> statement-breakpoint
CREATE INDEX "quarantine_seen_idx" ON "terminal"."quarantined_deals" USING btree ("last_seen_at");
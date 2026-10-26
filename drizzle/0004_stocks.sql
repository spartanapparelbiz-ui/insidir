CREATE TABLE "terminal"."sec_seen" (
	"key" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."users" ALTER COLUMN "settings" SET DEFAULT '{"minRoi":0.005,"minSizeUsd":0,"categories":[],"venues":["kalshi","polymarket","polymarket_us"],"showYellow":true,"showRed":false,"alertPush":false,"alertEmail":false,"emailDigest":false,"alertMinRoi":0.01,"soundOnGreen":false,"alertSafety":"green","alertCategories":[],"quietStart":null,"quietEnd":null,"timeZone":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "detail" jsonb;
ALTER TABLE "terminal"."watchlist" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminal"."watchlist" ADD COLUMN "settled" integer;--> statement-breakpoint
ALTER TABLE "terminal"."watchlist" ADD COLUMN "exclusion" text;--> statement-breakpoint
ALTER TABLE "terminal"."watchlist" ADD COLUMN "screen" jsonb;

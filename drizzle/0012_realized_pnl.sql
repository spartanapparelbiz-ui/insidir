ALTER TABLE "terminal"."moves" ADD COLUMN "pnl" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "sold_share" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "realized_at" timestamp with time zone;
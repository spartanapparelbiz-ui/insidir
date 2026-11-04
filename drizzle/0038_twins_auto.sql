ALTER TABLE "terminal"."market_twins" ADD COLUMN "auto" jsonb;--> statement-breakpoint
CREATE INDEX "market_twins_decided_idx" ON "terminal"."market_twins" USING btree ("decided_by","decided_at");

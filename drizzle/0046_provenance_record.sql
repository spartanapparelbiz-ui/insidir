-- Verify links and the public record (/record). Provenance on every position (terminal.millionaire_bets), backfilled
-- from terminal.moves (the Polygon transaction hashes and fills already kept there) and terminal.market_twins (Kalshi);
-- the append-only record log, seeded with every position ever on the board.
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "transaction_hash" text;--> statement-breakpoint
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "tx_hashes" jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "kalshi_url" text;--> statement-breakpoint
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "raw" jsonb;--> statement-breakpoint
UPDATE "terminal"."millionaire_bets" b SET
  "tx_hashes" = m."source_refs",
  "transaction_hash" = m."source_refs"->>0,
  "raw" = jsonb_build_object('backfill', 'moves.parts', 'parts', COALESCE(m."parts", '[]'::jsonb)),
  "fetched_at" = b."last_at"
FROM "terminal"."moves" m
WHERE m."id" = b."id" AND b."transaction_hash" IS NULL AND jsonb_typeof(m."source_refs") = 'array' AND jsonb_array_length(m."source_refs") > 0;--> statement-breakpoint
UPDATE "terminal"."millionaire_bets" b SET "kalshi_url" = t."kalshi_url"
FROM "terminal"."market_twins" t
WHERE t."polymarket_id" = b."market_id" AND t."status" = 'approved' AND b."kalshi_url" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."record_log" (
  "id" text PRIMARY KEY NOT NULL,
  "flagged_at" timestamp with time zone NOT NULL,
  "flags" text[] NOT NULL,
  "source" text NOT NULL,
  "market_id" text NOT NULL,
  "market_title" text NOT NULL,
  "event_title" text NOT NULL,
  "category" text NOT NULL,
  "wallet" text,
  "tier" text NOT NULL,
  "outcome" text NOT NULL,
  "outcome_side" text NOT NULL,
  "entry_price" double precision NOT NULL,
  "size" double precision NOT NULL,
  "transaction_hash" text,
  "tx_hashes" jsonb,
  "market_url" text,
  "kalshi_url" text,
  "fetched_at" timestamp with time zone,
  "raw" jsonb,
  "price_now" double precision,
  "price_at" timestamp with time zone,
  "result" text,
  "exit_price" double precision,
  "closed_at" timestamp with time zone,
  "logged_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_log_flagged_idx" ON "terminal"."record_log" USING btree ("flagged_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_log_category_idx" ON "terminal"."record_log" USING btree ("category", "flagged_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_log_wallet_idx" ON "terminal"."record_log" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_log_open_idx" ON "terminal"."record_log" USING btree ("result", "market_id");--> statement-breakpoint
-- Append-only: a DELETE does nothing. Rows are never filtered out or removed.
CREATE OR REPLACE RULE "record_log_no_delete" AS ON DELETE TO "terminal"."record_log" DO INSTEAD NOTHING;--> statement-breakpoint
INSERT INTO "terminal"."record_log" ("id", "flagged_at", "flags", "source", "market_id", "market_title", "event_title", "category", "wallet", "tier",
  "outcome", "outcome_side", "entry_price", "size", "transaction_hash", "tx_hashes", "market_url", "kalshi_url", "fetched_at", "raw", "result", "closed_at")
SELECT b."id", b."at", ARRAY[b."tier"], b."source", b."market_id", b."market_title", b."event_title", b."category", b."wallet", b."tier",
  b."outcome", b."outcome_side", b."price", b."amount", b."transaction_hash", b."tx_hashes", b."url", b."kalshi_url", b."fetched_at", b."raw", b."result", b."settled_at"
FROM "terminal"."millionaire_bets" b
ON CONFLICT ("id") DO NOTHING;

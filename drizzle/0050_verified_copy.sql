-- Copy trading (lib/verified, lib/copies): each $1M+ wallet's daily Verified checks, and a member's copies with what
-- they did (tapped Copy, then placed or skipped) and which wallet they copied, so exit and price-drop pushes find them.
CREATE TABLE IF NOT EXISTS "terminal"."wallet_verification" (
  "wallet" text PRIMARY KEY NOT NULL,
  "verified" boolean NOT NULL,
  "checks" jsonb NOT NULL,
  "months" jsonb NOT NULL,
  "pnl" double precision NOT NULL,
  "pnl30" double precision NOT NULL,
  "pnl90" double precision NOT NULL,
  "won" integer NOT NULL,
  "lost" integer NOT NULL,
  "by_category" jsonb NOT NULL,
  "bankroll" double precision,
  "avg_size" double precision,
  "avg_size_pct" double precision,
  "hedge_share" double precision NOT NULL,
  "last10" jsonb NOT NULL,
  "checked_at" timestamp with time zone NOT NULL,
  "verified_since" timestamp with time zone,
  "badge_lost_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "wallet_verification_verified_idx" ON "terminal"."wallet_verification" ("verified");
ALTER TABLE "terminal"."bet_copies" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'placed';
ALTER TABLE "terminal"."bet_copies" ADD COLUMN IF NOT EXISTS "wallet" text;
ALTER TABLE "terminal"."bet_copies" ADD COLUMN IF NOT EXISTS "their_amount" double precision;
ALTER TABLE "terminal"."bet_copies" ADD COLUMN IF NOT EXISTS "exit_pinged_at" timestamp with time zone;
ALTER TABLE "terminal"."bet_copies" ADD COLUMN IF NOT EXISTS "drop_pinged_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "bet_copies_wallet_market_idx" ON "terminal"."bet_copies" ("wallet", "market_id");
-- Earlier copies came from "I placed it": they're placed; fill in the wallet from the bet.
UPDATE "terminal"."bet_copies" c SET "wallet" = b."wallet", "their_amount" = b."amount" FROM "terminal"."millionaire_bets" b WHERE b."id" = c."bet_id" AND c."wallet" IS NULL;
-- When Insidir first saw each trade ("flagged in N seconds" on the landing: the median of seen_at − at, last 24 hours).
-- Older rows stay null: their first-seen time wasn't kept, and no number is made up for them.
ALTER TABLE "terminal"."millionaire_bets" ADD COLUMN IF NOT EXISTS "seen_at" timestamp with time zone;
ALTER TABLE "terminal"."millionaire_bets" ALTER COLUMN "seen_at" SET DEFAULT now();

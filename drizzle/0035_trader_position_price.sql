-- The average price a wallet paid for a resolved position (0..1), for the landing's wallet spotlight.
ALTER TABLE "terminal"."trader_positions" ADD COLUMN IF NOT EXISTS "avg_price" double precision;

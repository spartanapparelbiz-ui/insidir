-- One-tap copy v1: a member's own log of millionaire bets they placed themselves on Kalshi or Polymarket. Insidir never
-- places a trade or holds funds: "I placed it" records what the member says they did, and it settles with the market.
CREATE TABLE IF NOT EXISTS "terminal"."bet_copies" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL,
  "bet_id" text NOT NULL,
  "market_id" text NOT NULL,
  "title" text NOT NULL,
  "outcome" text NOT NULL,
  "outcome_side" text NOT NULL,
  "tier" text NOT NULL,
  "their_price" double precision NOT NULL,
  "price" double precision NOT NULL,
  "amount" double precision NOT NULL,
  "venue" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "result" text,
  "pnl" double precision,
  "settled_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "bet_copies_user_bet" ON "terminal"."bet_copies" ("user_id", "bet_id");
CREATE INDEX IF NOT EXISTS "bet_copies_open" ON "terminal"."bet_copies" ("market_id") WHERE "result" IS NULL;

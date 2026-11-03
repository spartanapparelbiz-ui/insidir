-- Market twins: a Polymarket market and its Kalshi twin (same event, outcome, line, resolution source and close date).
-- Built by the worker (lib/twins/store.ts); nothing is shown to anyone until a person approves it in /admin/twins.
CREATE TABLE IF NOT EXISTS "terminal"."market_twins" (
  "polymarket_id" text PRIMARY KEY,
  "kalshi_id" text NOT NULL,
  "kalshi_url" text NOT NULL,
  "polymarket_title" text NOT NULL,
  "kalshi_title" text NOT NULL,
  "kind" text NOT NULL,
  "verdict" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "confidence" double precision NOT NULL,
  "checks" jsonb NOT NULL,
  "notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "polymarket_close" timestamptz,
  "kalshi_close" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "decided_at" timestamptz,
  "decided_by" text
);
CREATE INDEX IF NOT EXISTS "market_twins_status_idx" ON "terminal"."market_twins" ("status");
CREATE INDEX IF NOT EXISTS "market_twins_kalshi_idx" ON "terminal"."market_twins" ("kalshi_id");

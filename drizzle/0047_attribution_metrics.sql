-- Attribution and metrics (lib/attribution.ts, lib/metrics): each account's first and last touch and the source it is
-- counted under; a dedupe key on events (billing and activation events are logged once); one row per account per
-- active day (retention); the daily metrics snapshot (/admin/metrics). Add-only.
ALTER TABLE "terminal"."users" ADD COLUMN IF NOT EXISTS "first_touch" jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN IF NOT EXISTS "last_touch" jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
UPDATE "terminal"."users" SET "source" = COALESCE(NULLIF(lower("utm"->>'utm_source'), ''), '(before tracking)') WHERE "source" IS NULL;--> statement-breakpoint
ALTER TABLE "terminal"."events" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_dedupe_idx" ON "terminal"."events" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_idx" ON "terminal"."events" ("user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."user_activity" (
  "user_id" text NOT NULL,
  "day" date NOT NULL,
  PRIMARY KEY ("user_id", "day")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."metrics_daily" (
  "day" date NOT NULL,
  "source" text NOT NULL,
  "visits" integer NOT NULL DEFAULT 0,
  "signups" integer NOT NULL DEFAULT 0,
  "trials" integer NOT NULL DEFAULT 0,
  "paid" integer NOT NULL DEFAULT 0,
  "paying" integer NOT NULL DEFAULT 0,
  "trial_to_paid" double precision,
  "mrr" double precision NOT NULL DEFAULT 0,
  "churn30" double precision,
  "activation" double precision,
  "retention" jsonb,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("day", "source")
);

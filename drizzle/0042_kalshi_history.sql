CREATE TABLE IF NOT EXISTS "terminal"."kalshi_history" (
  "move_id" text PRIMARY KEY NOT NULL,
  "kalshi_id" text NOT NULL,
  "ask" double precision,
  "read_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal"."twin_attempts" (
  "slug" text PRIMARY KEY NOT NULL,
  "found" boolean NOT NULL,
  "at" timestamp with time zone NOT NULL
);

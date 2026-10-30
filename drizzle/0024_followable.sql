CREATE TABLE "terminal"."move_tags" (
	"move_id" text NOT NULL,
	"tracker" text NOT NULL,
	"tagged_at" timestamp with time zone NOT NULL,
	"tagged_price" double precision,
	"src" text NOT NULL,
	CONSTRAINT "move_tags_move_id_tracker_pk" PRIMARY KEY("move_id","tracker")
);
--> statement-breakpoint
ALTER TABLE "terminal"."market_info" ADD COLUMN "end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "terminal"."moves" SET "seen_at" = "created_at" WHERE "seen_at" IS NULL;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ALTER COLUMN "seen_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "seen_price" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "seen_src" text;--> statement-breakpoint
ALTER TABLE "terminal"."trader_open" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "terminal"."trader_open" o SET "first_seen_at" = x.first FROM (
  SELECT t.wallet, t.market_id, t.outcome_index, min(m.at) AS first FROM "terminal"."trader_open" t
  JOIN "terminal"."moves" m ON m.wallet = t.wallet AND m.market_id = t.market_id AND m.outcome_side = (CASE WHEN t.outcome_index = 0 THEN 'yes' ELSE 'no' END)
  GROUP BY t.wallet, t.market_id, t.outcome_index) x
WHERE o.wallet = x.wallet AND o.market_id = x.market_id AND o.outcome_index = x.outcome_index;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moves_seen_due_idx" ON "terminal"."moves" USING btree ("seen_at") WHERE "seen_price" IS NULL AND "seen_src" IS NULL;

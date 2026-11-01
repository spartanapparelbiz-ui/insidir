CREATE TABLE "terminal"."cancel_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" text,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."read_ai_usage" (
	"who" text NOT NULL,
	"day" text NOT NULL,
	"usd" double precision DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "read_ai_usage_who_day_pk" PRIMARY KEY("who","day")
);
--> statement-breakpoint
CREATE TABLE "terminal"."reads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"visitor_id" text,
	"input" text NOT NULL,
	"market_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cancel_reasons_created_idx" ON "terminal"."cancel_reasons" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reads_user_idx" ON "terminal"."reads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reads_visitor_idx" ON "terminal"."reads" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "reads_created_idx" ON "terminal"."reads" USING btree ("created_at");
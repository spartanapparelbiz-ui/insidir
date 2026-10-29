CREATE TABLE "terminal"."bet_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"visitor_id" text,
	"input" text NOT NULL,
	"book" text,
	"legs" jsonb NOT NULL,
	"summary" text NOT NULL,
	"results" jsonb,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bet_checks_user_idx" ON "terminal"."bet_checks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bet_checks_visitor_idx" ON "terminal"."bet_checks" USING btree ("visitor_id");
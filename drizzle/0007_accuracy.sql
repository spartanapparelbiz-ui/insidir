CREATE TABLE "terminal"."accuracy_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"what" text NOT NULL,
	"target" text NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"problems" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."lifecycle_emails" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lifecycle_emails_user_id_kind_period_pk" PRIMARY KEY("user_id","kind","period")
);
--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "source_refs" jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
CREATE INDEX "accuracy_checks_run_idx" ON "terminal"."accuracy_checks" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "accuracy_checks_status_idx" ON "terminal"."accuracy_checks" USING btree ("status","run_at");
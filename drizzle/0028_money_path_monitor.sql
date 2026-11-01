CREATE TABLE "terminal"."monitor_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"failed_step" text,
	"detail" text,
	"ms" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"notified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "monitor_runs_at_idx" ON "terminal"."monitor_runs" USING btree ("at");
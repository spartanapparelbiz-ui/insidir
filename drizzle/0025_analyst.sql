CREATE TABLE "terminal"."analyst_notes" (
	"move_id" text PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"facts" jsonb NOT NULL,
	"model" text NOT NULL,
	"origin" text NOT NULL,
	"version" integer NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."research_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"visitor_id" text,
	"question" text NOT NULL,
	"key" text NOT NULL,
	"answer" jsonb,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analyst_notes_created_idx" ON "terminal"."analyst_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "research_user_idx" ON "terminal"."research_queries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "research_visitor_idx" ON "terminal"."research_queries" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "research_key_idx" ON "terminal"."research_queries" USING btree ("key","created_at");
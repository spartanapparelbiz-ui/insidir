CREATE TABLE "terminal"."entity_art" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"treatment" text NOT NULL,
	"colour" text NOT NULL,
	"mono" text NOT NULL,
	"key" text,
	"sizes" jsonb,
	"w" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"fx" double precision DEFAULT 0.5 NOT NULL,
	"fy" double precision DEFAULT 0.5 NOT NULL,
	"source_url" text,
	"source_page" text,
	"license" text,
	"license_url" text,
	"author" text,
	"why" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "entity_art_kind_idx" ON "terminal"."entity_art" USING btree ("kind");
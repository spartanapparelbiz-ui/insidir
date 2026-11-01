CREATE TABLE "terminal"."read_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"who" text NOT NULL,
	"keys" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."reads" ADD COLUMN "counted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "read_offers_who_idx" ON "terminal"."read_offers" USING btree ("who","created_at");
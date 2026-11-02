ALTER TABLE "terminal"."read_seen" ADD COLUMN "yes_dollars" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."read_seen" ADD COLUMN "no_dollars" double precision;--> statement-breakpoint
ALTER TABLE "terminal"."reads" ADD COLUMN "question" text;
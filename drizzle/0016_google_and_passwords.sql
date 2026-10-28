ALTER TABLE "terminal"."checkout_claims" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "terminal"."checkout_claims" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "google_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_idx" ON "terminal"."users" USING btree ("google_id");
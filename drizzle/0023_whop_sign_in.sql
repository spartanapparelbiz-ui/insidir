DROP TABLE "terminal"."checkout_claims" CASCADE;--> statement-breakpoint
DROP INDEX "terminal"."users_google_idx";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "google_id";
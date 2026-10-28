DROP TABLE "terminal"."password_resets" CASCADE;--> statement-breakpoint
ALTER TABLE "terminal"."checkout_claims" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "password_hash";
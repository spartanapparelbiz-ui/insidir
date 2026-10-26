-- Whop SDK migration. Existing users keep their id (it was the Whop user id), which also fills whop_user_id.
-- Membership state is no longer copied into users: users.checkAccess answers on every paid request.
ALTER TABLE "terminal"."users" ADD COLUMN "whop_user_id" text;--> statement-breakpoint
UPDATE "terminal"."users" SET "whop_user_id" = "id" WHERE "whop_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "terminal"."users" ALTER COLUMN "whop_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD CONSTRAINT "users_whop_user_id_unique" UNIQUE("whop_user_id");--> statement-breakpoint
ALTER TABLE "terminal"."users" RENAME COLUMN "username" TO "whop_username";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "membership_id";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "manage_url";--> statement-breakpoint
ALTER TABLE "terminal"."users" DROP COLUMN "cancel_at_period_end";--> statement-breakpoint
ALTER TABLE "terminal"."webhook_events" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "terminal"."webhook_events" ADD COLUMN "status" text DEFAULT 'processed' NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal"."webhook_events" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "terminal"."webhook_events" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "terminal"."webhook_events" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "webhook_events_type_ref_idx" ON "terminal"."webhook_events" USING btree ("type","ref");

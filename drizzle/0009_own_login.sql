CREATE TABLE "terminal"."checkout_claims" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terminal"."login_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"ip" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "whop_user_id" text;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "membership_status" text;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminal"."checkout_claims" ADD CONSTRAINT "checkout_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "terminal"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_codes_email_idx" ON "terminal"."login_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_codes_ip_idx" ON "terminal"."login_codes" USING btree ("ip","created_at");--> statement-breakpoint
-- Existing accounts: emails lower-case and one account per email (the oldest keeps it); Whop ids carried over.
UPDATE "terminal"."users" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;--> statement-breakpoint
UPDATE "terminal"."users" u SET "email" = NULL WHERE "email" IS NOT NULL AND EXISTS (SELECT 1 FROM "terminal"."users" o WHERE o."email" = u."email" AND (o."created_at", o."id") < (u."created_at", u."id"));--> statement-breakpoint
UPDATE "terminal"."users" SET "whop_user_id" = "id" WHERE "id" LIKE 'user\_%';--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "terminal"."users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_whop_user_idx" ON "terminal"."users" USING btree ("whop_user_id");
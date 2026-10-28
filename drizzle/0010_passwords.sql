CREATE TABLE "terminal"."login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "terminal"."checkout_claims" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "terminal"."checkout_claims" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "terminal"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "terminal"."password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "terminal"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "terminal"."login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "terminal"."login_attempts" USING btree ("ip","created_at");
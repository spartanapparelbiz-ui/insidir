CREATE TABLE "terminal"."trader_avatars" (
	"wallet" text PRIMARY KEY NOT NULL,
	"url" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"hidden_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "trader_avatars_checked_idx" ON "terminal"."trader_avatars" USING btree ("checked_at");
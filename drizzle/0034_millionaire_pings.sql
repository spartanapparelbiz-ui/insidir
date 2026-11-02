CREATE TABLE "terminal"."millionaire_pings" (
	"user_id" text NOT NULL,
	"move_id" text NOT NULL,
	"day" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "millionaire_pings_user_id_move_id_pk" PRIMARY KEY("user_id","move_id")
);
--> statement-breakpoint
CREATE INDEX "millionaire_pings_day_idx" ON "terminal"."millionaire_pings" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "millionaire_pings_move_idx" ON "terminal"."millionaire_pings" USING btree ("move_id");
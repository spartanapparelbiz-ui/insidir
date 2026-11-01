CREATE TABLE "terminal"."wallet_pnl" (
	"wallet" text PRIMARY KEY NOT NULL,
	"closed" integer NOT NULL,
	"closed_at_least" boolean DEFAULT false NOT NULL,
	"pnl" double precision,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wallet_pnl_read_idx" ON "terminal"."wallet_pnl" USING btree ("read_at");
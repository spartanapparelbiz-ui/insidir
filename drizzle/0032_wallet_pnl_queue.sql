CREATE TABLE "terminal"."wallet_pnl_queue" (
	"wallet" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone NOT NULL
);

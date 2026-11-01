CREATE TABLE "terminal"."read_seen" (
	"user_id" text NOT NULL,
	"market_key" text NOT NULL,
	"yes_share" double precision,
	"wallets" integer DEFAULT 0 NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_seen_user_id_market_key_pk" PRIMARY KEY("user_id","market_key")
);

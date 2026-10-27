CREATE TABLE "terminal"."follows" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_kind_target_pk" PRIMARY KEY("user_id","kind","target")
);
--> statement-breakpoint
CREATE TABLE "terminal"."moves" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"market_id" text NOT NULL,
	"event_title" text NOT NULL,
	"market_title" text NOT NULL,
	"outcome" text NOT NULL,
	"outcome_side" text NOT NULL,
	"amount" double precision NOT NULL,
	"avg_price" double precision NOT NULL,
	"wallet" text,
	"wallet_name" text,
	"at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"fills" integer DEFAULT 1 NOT NULL,
	"tab" text NOT NULL,
	"league" text,
	"category" text NOT NULL,
	"url" text,
	"result" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."trader_records" (
	"wallet" text PRIMARY KEY NOT NULL,
	"name" text,
	"resolved" integer NOT NULL,
	"won" integer NOT NULL,
	"lost" integer NOT NULL,
	"profit" double precision NOT NULL,
	"biggest_win" double precision NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."waitlist" (
	"email" text NOT NULL,
	"feature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "waitlist_email_feature_pk" PRIMARY KEY("email","feature")
);
--> statement-breakpoint
ALTER TABLE "terminal"."follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "terminal"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moves_at_idx" ON "terminal"."moves" USING btree ("at");--> statement-breakpoint
CREATE INDEX "moves_tab_at_idx" ON "terminal"."moves" USING btree ("tab","at");--> statement-breakpoint
CREATE INDEX "moves_wallet_idx" ON "terminal"."moves" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "moves_market_idx" ON "terminal"."moves" USING btree ("market_id");
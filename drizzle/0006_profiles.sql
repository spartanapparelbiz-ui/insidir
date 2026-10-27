CREATE TABLE "terminal"."fund_filings" (
	"fund_cik" text NOT NULL,
	"accession" text NOT NULL,
	"period" text,
	"filed_on" text NOT NULL,
	"url" text NOT NULL,
	"complete" boolean NOT NULL,
	CONSTRAINT "fund_filings_fund_cik_accession_pk" PRIMARY KEY("fund_cik","accession")
);
--> statement-breakpoint
CREATE TABLE "terminal"."fund_holdings" (
	"fund_cik" text NOT NULL,
	"accession" text NOT NULL,
	"cusip" text NOT NULL,
	"company" text NOT NULL,
	"shares" double precision NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "fund_holdings_fund_cik_accession_cusip_pk" PRIMARY KEY("fund_cik","accession","cusip")
);
--> statement-breakpoint
CREATE TABLE "terminal"."funds" (
	"cik" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"quarters_on_file" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."insider_trades" (
	"accession" text NOT NULL,
	"line" integer NOT NULL,
	"owner_cik" text NOT NULL,
	"owner_name" text NOT NULL,
	"role" text NOT NULL,
	"issuer_cik" text NOT NULL,
	"company" text NOT NULL,
	"ticker" text,
	"code" text NOT NULL,
	"trade_date" text,
	"shares" double precision NOT NULL,
	"price" double precision NOT NULL,
	"value" double precision NOT NULL,
	"filed_at" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "insider_trades_accession_owner_cik_line_pk" PRIMARY KEY("accession","owner_cik","line")
);
--> statement-breakpoint
CREATE TABLE "terminal"."sec_history" (
	"kind" text NOT NULL,
	"cik" text NOT NULL,
	"name" text,
	"pending" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"complete_since" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sec_history_kind_cik_pk" PRIMARY KEY("kind","cik")
);
--> statement-breakpoint
CREATE TABLE "terminal"."tracked_wallets" (
	"wallet" text PRIMARY KEY NOT NULL,
	"name" text,
	"reason" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal"."trader_positions" (
	"wallet" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome_index" integer NOT NULL,
	"title" text NOT NULL,
	"outcome" text,
	"event_slug" text,
	"category" text NOT NULL,
	"tab" text NOT NULL,
	"money_in" double precision NOT NULL,
	"pnl" double precision NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "trader_positions_wallet_market_id_outcome_index_pk" PRIMARY KEY("wallet","market_id","outcome_index")
);
--> statement-breakpoint
ALTER TABLE "terminal"."moves" ADD COLUMN "new_wallet" boolean;--> statement-breakpoint
ALTER TABLE "terminal"."trader_records" ADD COLUMN "biggest_bet" double precision;--> statement-breakpoint
CREATE INDEX "insider_trades_owner_idx" ON "terminal"."insider_trades" USING btree ("owner_cik","filed_at");--> statement-breakpoint
CREATE INDEX "insider_trades_issuer_idx" ON "terminal"."insider_trades" USING btree ("issuer_cik","filed_at");--> statement-breakpoint
CREATE INDEX "trader_positions_resolved_idx" ON "terminal"."trader_positions" USING btree ("resolved_at");
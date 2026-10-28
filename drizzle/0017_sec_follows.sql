CREATE TABLE "terminal"."stock_closes" (
	"ticker" text NOT NULL,
	"date" text NOT NULL,
	"close" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_closes_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE INDEX "insider_trades_ticker_idx" ON "terminal"."insider_trades" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "insider_trades_filed_idx" ON "terminal"."insider_trades" USING btree ("filed_at");
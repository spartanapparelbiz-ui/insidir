-- The tier is the wallet's all-time profit and nothing else: $1M+ is Millionaire, $100K+ is Pro. The proven screen used
-- to re-tag screened $1M+ wallets as Pro (a +$5.6M wallet showed as Pro), and every stored bet kept the tier it was read
-- with, so most $1M+ bets were missing from every $1M+ count. Recompute the watchlist from profit, then carry each
-- wallet's tier onto its stored bets, positions and record rows (lib/millionaires/watchlist.ts syncTiers does the same
-- after every refresh).
UPDATE "terminal"."watchlist" SET "tier" = CASE WHEN "pnl" >= 1000000 THEN 'millionaire' ELSE 'pro' END
  WHERE "tier" <> CASE WHEN "pnl" >= 1000000 THEN 'millionaire' ELSE 'pro' END;--> statement-breakpoint
UPDATE "terminal"."millionaire_bets" b SET "tier" = w."tier" FROM "terminal"."watchlist" w
  WHERE b."wallet" = w."wallet" AND b."tier" <> w."tier";--> statement-breakpoint
UPDATE "terminal"."position_events" b SET "tier" = w."tier" FROM "terminal"."watchlist" w
  WHERE b."wallet" = w."wallet" AND b."tier" <> w."tier";--> statement-breakpoint
UPDATE "terminal"."record_log" r SET "tier" = w."tier",
  "flags" = CASE WHEN w."tier" = ANY(r."flags") THEN r."flags" ELSE array(SELECT DISTINCT unnest(r."flags" || array[w."tier"])) END
  FROM "terminal"."watchlist" w WHERE r."wallet" = w."wallet" AND r."tier" IN ('millionaire', 'pro') AND r."tier" <> w."tier";

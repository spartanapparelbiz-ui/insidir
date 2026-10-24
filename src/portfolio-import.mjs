/* Save a confirmed portfolio import atomically as a monitored watchlist and optional self-reported quantities.
 * No brokerage CSV bytes, cost basis, trade history, personal name or account numbers are stored. */
const invalid=msg=>Object.assign(new Error(msg),{status:400});
const TICKER=/^[A-Z][A-Z0-9.-]{0,9}$/;
const QUANTITY=/^\d{1,10}(?:\.\d{1,8})?$/;

export function validatePortfolioImport(data) {
  if(!data || typeof data!=="object" || Array.isArray(data) || !Array.isArray(data.items))throw invalid("Expected a portfolio positions list.");
  if(!data.items.length || data.items.length>100)throw invalid("Import between 1 and 100 positions.");
  const seen=new Set();
  return data.items.map(item=>{
    if(!item || typeof item!=="object" || Array.isArray(item))throw invalid("Invalid portfolio position.");
    // Never accept an entire brokerage export or account identifiers in the API.
    if(Object.keys(item).some(key=>key!=="ticker" && key!=="quantity"))throw invalid("Only tickers and share quantities may be imported.");
    if(typeof item.ticker!=="string")throw invalid("Ticker must be text.");
    const ticker=item.ticker.trim().toUpperCase();
    if(!TICKER.test(ticker))throw invalid("Invalid stock symbol.");
    if(seen.has(ticker))throw invalid("Duplicate ticker in import.");
    seen.add(ticker);
    if(item.quantity==null)return {ticker,quantity:null};
    const quantity=String(item.quantity).trim();
    if(!QUANTITY.test(quantity)||Number(quantity)<=0||Number(quantity)>1e9)throw invalid("Invalid share quantity.");
    return {ticker,quantity};
  });
}

/* One SQL statement, so rejected imports never save only half a portfolio.
 * Preserve existing watchlist/holdings; do not delete stocks absent from the CSV.
 * Manual quantity storage retains the existing 100-row per-member cap. */
export async function savePortfolioImport(userId, items, run) {
  const data=items.map((item,ord)=>({...item,ord}));
  const result=await run(`
    WITH incoming AS (
      SELECT ticker,quantity,ord FROM jsonb_to_recordset($2::jsonb)
        AS x(ticker text,quantity text,ord integer)
    ), existing AS (
      SELECT ticker FROM manual_holdings WHERE user_id=$1
    ), ranked AS (
      SELECT i.ticker,ROW_NUMBER() OVER (ORDER BY i.ord) AS rank
      FROM incoming i WHERE i.quantity IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM existing e WHERE e.ticker=i.ticker)
    ), eligible AS (
      SELECT i.ticker,i.quantity FROM incoming i
      WHERE i.quantity IS NOT NULL
        AND (EXISTS (SELECT 1 FROM existing e WHERE e.ticker=i.ticker)
        OR EXISTS (SELECT 1 FROM ranked n WHERE n.ticker=i.ticker
          AND n.rank <= GREATEST(0,100-(SELECT COUNT(*) FROM existing))))
    ), watch_saved AS (
      INSERT INTO watchlist(user_id,ticker)
      SELECT $1,ticker FROM incoming WHERE TRUE ON CONFLICT DO NOTHING RETURNING ticker
    ), holdings_saved AS (
      INSERT INTO manual_holdings(user_id,ticker,quantity)
      SELECT $1,ticker,quantity::numeric FROM eligible WHERE TRUE
      ON CONFLICT(user_id,ticker) DO UPDATE
        SET quantity=EXCLUDED.quantity,updated_at=now()
      RETURNING ticker
    )
    SELECT (SELECT COUNT(*) FROM watch_saved)::int AS newly_followed,
      (SELECT COUNT(*) FROM holdings_saved)::int AS quantities_saved,
      (SELECT COUNT(*) FROM incoming WHERE quantity IS NOT NULL)::int AS quantities_submitted
  `,[userId,JSON.stringify(data)]);
  const stats=result.rows?.[0]||{};
  const quantitiesSaved=Number(stats.quantities_saved||0);
  const quantitiesSubmitted=Number(stats.quantities_submitted||0);
  return {
    imported:items.length,
    newlyFollowed:Number(stats.newly_followed||0),
    quantitiesSaved,
    quantitiesNotSaved:Math.max(0,quantitiesSubmitted-quantitiesSaved),
    note:"Tickers were added to the private monitored watchlist. Imported share quantities are self-reported, not verified brokerage balances. Alerts depend on supported filings and notification settings. Existing entries not in the file were left unchanged."
  };
}

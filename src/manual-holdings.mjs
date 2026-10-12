// User-entered holdings are *not* verified brokerage balances, trades or recommendations.
const invalid=message=>Object.assign(new Error(message),{status:400});
export function validateManualHolding(input) {
  if(!input||typeof input!=="object"||Array.isArray(input))throw invalid("Expected a holding");
  if(typeof input.ticker!=="string")throw invalid("Enter a stock ticker");
  const ticker=input.ticker.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker))throw invalid("Invalid ticker");
  const raw=input.quantity;
  if((typeof raw!=="string"&&typeof raw!=="number")||
    (typeof raw==="number"&&!Number.isFinite(raw)))throw invalid("Enter a valid share quantity");
  const quantity=String(raw).trim();
  if(!/^(?:\d{1,10})(?:\.\d{1,8})?$/.test(quantity)||Number(quantity)<=0||Number(quantity)>1e9)
    throw invalid("Shares must be greater than zero and at most 1 billion, with up to eight decimal places");
  return {ticker,quantity};
}

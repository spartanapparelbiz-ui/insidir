/* Private, client-side holdings CSV parser. The raw brokerage file is never uploaded. */
export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 2500;
export const MAX_CSV_POSITIONS = 100;

const canonical = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const symbols = new Set(["symbol","ticker","stocksymbol","securitysymbol","tickersymbol","stockticker"]);
const quantities = new Set(["quantity","qty","shares","sharequantity","totalshares","totalquantity","currentquantity","qtyquantity","positionquantity","units","numberofshares"]);
const descriptions = new Set(["description","securitydescription","securityname","name","instrument","instrumentdescription"]);
const assetTypes = new Set(["assettype","assetclass","securitytype","investmenttype","instrumenttype","type"]);
const nonStocks = /(?:\boption\b|\bcall\b|\bput\b|\bcrypto\b|\bcash\b|\bmoney market\b|\bsweep\b|\bforeign currency\b|\bcertificate of deposit\b)/i;
const invalidSymbols = new Set(["CASH","USD","US DOLLAR","TOTAL","ACCOUNT","SWEEP","SPAXX","FDRXX","VMFXX","SWVXX","FDIC","N/A","--"]);
const validTicker = /^[A-Z][A-Z0-9.-]{0,9}$/;

function separatorOf(text) {
  // Guess from the first several physical lines. Commas inside quoted names are ignored.
  const lines = String(text).split(/\r\n|\n|\r/).slice(0,16).join("\n");
  const scores = {",":0,"\t":0,";":0}; let quoted=false;
  for(let i=0;i<lines.length;i++) {
    const c=lines[i];
    if(c==='"') {if(quoted && lines[i+1]==='"'){i++;continue;}quoted=!quoted;}
    else if(!quoted && Object.prototype.hasOwnProperty.call(scores,c))scores[c]++;
  }
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
}

export function csvRows(raw, delimiter = separatorOf(raw)) {
  if(typeof raw!=="string" || !raw.trim())throw Error("Choose a non-empty brokerage holdings CSV.");
  if(new TextEncoder().encode(raw).byteLength > MAX_CSV_BYTES)throw Error("CSV is too large (1 MB maximum).");
  const text=raw.replace(/^\uFEFF/,"");
  let field="",row=[],rows=[],inside=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inside){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{inside=false;closed=true;}}
      else field+=c;
    }else if(c==='"'){
      if(field.trim()!=="" || closed)throw Error("CSV contains malformed quoting.");
      inside=true;
    }else if(c===delimiter){row.push(field);field="";closed=false;}
    else if(c==="\n" || c==="\r"){
      row.push(field);field="";closed=false;
      if(row.some(x=>x.trim()!==""))rows.push(row);
      if(rows.length>MAX_CSV_ROWS)throw Error("CSV has too many rows (2,500 maximum).");
      row=[];
      if(c==="\r" && text[i+1]==="\n")i++;
    }else{
      if(closed && c!==" " && c!=="\t")throw Error("CSV contains malformed quoting.");
      field+=c;
    }
  }
  if(inside)throw Error("CSV contains an unclosed quoted field.");
  if(field!=="" || row.length){row.push(field);if(row.some(x=>x.trim()!==""))rows.push(row);}
  if(rows.length>MAX_CSV_ROWS)throw Error("CSV has too many rows (2,500 maximum).");
  return rows;
}

const qtyValue = raw => {
  let value=String(raw ?? "").trim().replace(/,/g,"");
  if(!value)return null;
  // A negative or zero position is not an owned long stock holding.
  if(!/^\+?\d+(?:\.\d{1,8})?$/.test(value))return NaN;
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||n>1e9)return NaN;
  return n;
};
const numberString = n => n.toFixed(8).replace(/\.?0+$/,"");

export function parsePortfolioCsv(text) {
  const rows=csvRows(text);
  let headerIndex=-1,si=-1,qi=-1,di=-1,ti=-1;
  for(let i=0;i<Math.min(30,rows.length);i++){
    const h=rows[i].map(canonical);
    const symbol=h.findIndex(x=>symbols.has(x));
    if(symbol<0)continue;
    // A transaction-history export must never be misrepresented as current positions.
    const history=h.some(x=>/^(transactiondate|tradedate|settlementdate|activitydate|transactiontype|transactionaction|action|side|buyorsell|activity)$/.test(x));
    if(history)throw Error("This looks like a transaction history. Export current holdings/positions instead.");
    headerIndex=i;si=symbol;qi=h.findIndex(x=>quantities.has(x));di=h.findIndex(x=>descriptions.has(x));ti=h.findIndex(x=>assetTypes.has(x));
    break;
  }
  if(headerIndex<0)throw Error("No ticker/symbol column found. Export a holdings/positions CSV, not an account statement.");
  const found=new Map();const reasons={empty:0,unsupported:0,nonStock:0,closed:0,duplicates:0};
  for(const row of rows.slice(headerIndex+1)){
    const raw=String(row[si]??"").trim();
    if(!raw){reasons.empty++;continue;}
    const ticker=raw.replace(/^\$/,"").toUpperCase();
    const description=di>=0?String(row[di]??""):"";
    const assetType=ti>=0?String(row[ti]??""):"";
    if(invalidSymbols.has(ticker)||!validTicker.test(ticker)){reasons.unsupported++;continue;}
    if(nonStocks.test(description)||nonStocks.test(assetType)||/\b(?:bond|fixed income|future|warrant)\b/i.test(assetType)){reasons.nonStock++;continue;}
    let quantity=null;
    if(qi>=0){
      const v=qtyValue(row[qi]);
      if(v===null || Number.isNaN(v)){reasons.closed++;continue;}
      quantity=v;
    }
    if(found.has(ticker)){
      reasons.duplicates++;
      const entry=found.get(ticker);
      if(quantity!==null){
        const total=(entry.quantity===null?0:entry.quantity)+quantity;
        if(total>1e9)throw Error("Combined share quantity exceeds the supported limit.");
        entry.quantity=total;
      }
    }else{
      if(found.size===MAX_CSV_POSITIONS)throw Error("More than 100 positions found. Import a smaller holdings export.");
      found.set(ticker,{ticker,quantity});
    }
  }
  if(!found.size)throw Error("No valid active stock holdings found. Check that this is a current positions export.");
  const items=[...found.values()].map(({ticker,quantity})=>({ticker,quantity:quantity===null?null:numberString(quantity)}));
  return {items,skipped:reasons,hasQuantities:qi>=0,rowsExamined:rows.length-headerIndex-1};
}

import test from "node:test";
import assert from "node:assert/strict";
import {csvRows,parsePortfolioCsv,MAX_CSV_BYTES} from "../web/assets/js/portfolio-csv.mjs";
import {validatePortfolioImport,savePortfolioImport} from "../src/portfolio-import.mjs";

test("Fidelity-style export: preamble, quoted comma in company name, valid share values",()=>{
 const csv='Account 0000 (heading only)\nPositions exported\nSymbol,Description,Quantity,Last Price,Account Number\n"AAPL","Apple, Inc.",2.5,$250,123456\nNVDA,NVIDIA Corporation,4,200,123456\nCASH,Cash Balance,300,1,123456\n';
 const result=parsePortfolioCsv(csv);
 assert.deepEqual(result.items,[{ticker:"AAPL",quantity:"2.5"},{ticker:"NVDA",quantity:"4"}]);
 assert.equal(result.skipped.unsupported,1);
 assert.ok(!JSON.stringify(result).includes("123456"));
});

test("Schwab-style quantity header and duplicate lots are combined",()=>{
 const csv='Symbol,Description,Qty (Quantity),Price\nAAPL,Apple,2.25,100\nAAPL,Apple,0.75,101\nTSLA,Tesla,4,200\n';
 const result=parsePortfolioCsv(csv);
 assert.deepEqual(result.items,[{ticker:"AAPL",quantity:"3"},{ticker:"TSLA",quantity:"4"}]);
 assert.equal(result.skipped.duplicates,1);
});

test("TSV and semicolon files work, including UTF-8 BOM",()=>{
 assert.deepEqual(parsePortfolioCsv("\uFEFFSymbol\tQuantity\nPLTR\t1.125\n").items,[{ticker:"PLTR",quantity:"1.125"}]);
 assert.deepEqual(parsePortfolioCsv("Symbol;Quantity\nMSFT;3\n").items,[{ticker:"MSFT",quantity:"3"}]);
});

test("Ticker-only holdings list monitors stocks without invented share balances",()=>{
 const result=parsePortfolioCsv("Ticker,Description\nAAPL,Apple\nNVDA,NVIDIA\n");
 assert.equal(result.hasQuantities,false);
 assert.deepEqual(result.items,[{ticker:"AAPL",quantity:null},{ticker:"NVDA",quantity:null}]);
});

test("Transaction-history exports are rejected instead of generating false holdings",()=>{
 assert.throws(()=>parsePortfolioCsv("Trade Date,Symbol,Quantity,Action\n2026-10-01,AAPL,5,SELL"),/transaction history/i);
 assert.throws(()=>parsePortfolioCsv("Transaction Date,Symbol,Quantity\n2026-10-01,AAPL,5"),/transaction history/i);
});

test("Zero, negative, options and cash rows are excluded",()=>{
 const result=parsePortfolioCsv('Symbol,Description,Quantity\nAAPL,Apple,2\nTSLA,Tesla,0\nNVDA,NVIDIA,-2\nSPAXX,Fidelity Government Money Market,100\nMSFT,Microsoft Call Option,1\n');
 assert.deepEqual(result.items,[{ticker:"AAPL",quantity:"2"}]);
 assert.equal(result.skipped.closed,2);
 assert.equal(result.skipped.nonStock,1);
});

test("Malformed, oversize, and symbol-free inputs fail safely",()=>{
 assert.throws(()=>parsePortfolioCsv(""),/non-empty/);
 assert.throws(()=>parsePortfolioCsv('Symbol,Quantity\n"AAPL,3\n'),/unclosed/);
 assert.throws(()=>parsePortfolioCsv("Date,Amount\n2026-01-01,10"),/ticker/);
 assert.throws(()=>parsePortfolioCsv("Symbol,Quantity\n=CMD,10"),/No valid/);
 assert.throws(()=>parsePortfolioCsv("Symbol,Quantity\n"+"AAPL,1\n".repeat(2600)),/too many rows/);
 assert.throws(()=>parsePortfolioCsv("a".repeat(MAX_CSV_BYTES+1)),/too large/);
});

test("Reject more than 100 unique positions before confirming",()=>{
 const csv="Symbol,Quantity\n"+Array.from({length:101},(_,i)=>"A"+String(i).padStart(3,"0")+",1").join("\n");
 assert.throws(()=>parsePortfolioCsv(csv),/More than 100/);
});

test("Only strict ticker and positive share quantity cross paid API boundary",()=>{
 assert.deepEqual(validatePortfolioImport({items:[{ticker:" aapl ",quantity:"1.25"},{ticker:"NVDA",quantity:null}]}),
   [{ticker:"AAPL",quantity:"1.25"},{ticker:"NVDA",quantity:null}]);
 for(const items of [
   [],Array.from({length:101},()=>({ticker:"AAPL",quantity:"1"})),
   [{ticker:"AAPL",quantity:"1"},{ticker:"AAPL",quantity:"2"}],
   [{ticker:"AAPL",quantity:"0"}],
   [{ticker:"AAPL",quantity:"-1"}],
   [{ticker:"AAPL",quantity:"1.123456789"}],
   [{ticker:"=HYPERLINK",quantity:1}],
   [{ticker:"AAPL",quantity:2,accountNumber:"12345"}]
 ])assert.throws(()=>validatePortfolioImport({items}),/./);
});

test("Atomic server import transmits only ticker and quantity, tracks totals",async()=>{
 let calls=0;let queryText="",params=[];
 const saved=await savePortfolioImport("user-1",validatePortfolioImport({items:[{ticker:"AAPL",quantity:"2.5"},{ticker:"NVDA",quantity:null}]}),async(sql,p)=>{
   calls++;queryText=sql;params=p;
   return {rows:[{newly_followed:2,quantities_saved:1,quantities_submitted:1}]};
 });
 assert.equal(calls,1);
 assert.match(queryText,/INSERT INTO watchlist/);
 assert.match(queryText,/INSERT INTO manual_holdings/);
 assert.match(queryText,/ON CONFLICT/);
 assert.deepEqual(JSON.parse(params[1]),[{ticker:"AAPL",quantity:"2.5",ord:0},{ticker:"NVDA",quantity:null,ord:1}]);
 assert.equal(saved.imported,2);
 assert.equal(saved.newlyFollowed,2);
 assert.equal(saved.quantitiesSaved,1);
 assert.equal(saved.quantitiesNotSaved,0);
});

test("CSV quoting and newlines are parsed without breaking fields",()=>{
 assert.deepEqual(csvRows('Symbol,Description,Quantity\r\n"AAPL","Apple ""Incorporated""\nUS",1\r\n'),
  [["Symbol","Description","Quantity"],["AAPL",'Apple "Incorporated"\nUS',"1"]]);
});

test("PostgreSQL integration: writes monitored watchlist, quantities and keeps existing entries atomically",
  {skip:!process.env.INSIDIR_TEST_DATABASE_URL && "Set INSIDIR_TEST_DATABASE_URL for the real PostgreSQL test"},async()=>{
    const pg=await import("pg");
    const client=new pg.default.Client({connectionString:process.env.INSIDIR_TEST_DATABASE_URL});
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE watchlist (user_id text NOT NULL,ticker text NOT NULL,created_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,ticker)) ON COMMIT DROP");
      await client.query("CREATE TEMP TABLE manual_holdings (user_id text NOT NULL,ticker text NOT NULL,quantity numeric(24,8) NOT NULL CHECK(quantity>0),updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,ticker)) ON COMMIT DROP");
      await client.query("INSERT INTO watchlist(user_id,ticker) VALUES('test-user','MSFT')");
      await client.query("INSERT INTO manual_holdings(user_id,ticker,quantity) VALUES('test-user','MSFT',3)");

      const items=validatePortfolioImport({items:[
        {ticker:"AAPL",quantity:"2.5"},{ticker:"NVDA",quantity:"4"},{ticker:"PLTR",quantity:null}
      ]});
      const run=(sql,params)=>client.query(sql,params);
      let outcome=await savePortfolioImport("test-user",items,run);
      assert.equal(outcome.imported,3);
      assert.equal(outcome.newlyFollowed,3);
      assert.equal(outcome.quantitiesSaved,2);
      assert.equal(outcome.quantitiesNotSaved,0);
      let rows=await client.query("SELECT ticker FROM watchlist WHERE user_id='test-user' ORDER BY ticker");
      assert.deepEqual(rows.rows.map(x=>x.ticker),["AAPL","MSFT","NVDA","PLTR"]);
      rows=await client.query("SELECT ticker,quantity::text FROM manual_holdings WHERE user_id='test-user' ORDER BY ticker");
      assert.deepEqual(rows.rows.map(x=>[x.ticker,x.quantity]),[["AAPL","2.50000000"],["MSFT","3.00000000"],["NVDA","4.00000000"]]);

      outcome=await savePortfolioImport("test-user",items,run);
      assert.equal(outcome.newlyFollowed,0,"repeat import must not duplicate the watchlist");
      assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM watchlist")).rows[0].n,4);
      const changed=validatePortfolioImport({items:[{ticker:"AAPL",quantity:"3.25"}]});
      await savePortfolioImport("test-user",changed,run);
      assert.equal((await client.query("SELECT quantity::text AS n FROM manual_holdings WHERE ticker='AAPL'")).rows[0].n,"3.25000000");
      assert.equal((await client.query("SELECT quantity::text AS n FROM manual_holdings WHERE ticker='MSFT'")).rows[0].n,"3.00000000");

      // Rejecting an import before the SQL call must not mutate any member data.
      assert.throws(()=>validatePortfolioImport({items:[{ticker:"AAPL",quantity:"-20"}]}));
      assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM watchlist")).rows[0].n,4);
    } finally {
      await client.query("ROLLBACK").catch(()=>{});
      await client.end();
    }
  });

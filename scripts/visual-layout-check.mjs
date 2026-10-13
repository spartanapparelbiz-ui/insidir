/* Insidir V9 browser gate: confirm clean landing, mobile navigation, real images and live workspace. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {serveStatic} from "../src/web.mjs";
import {chromium} from "playwright-core";
const server=createServer((req,res)=>{serveStatic(req,res).then(found=>{if(!found){res.writeHead(404);res.end("not found");}}).catch(e=>{res.writeHead(500);res.end(String(e));});});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(const item of [{width:375,height:812},{width:390,height:844},{width:1440,height:900}]){
  const context=await browser.newContext({viewport:item,deviceScaleFactor:1,isMobile:item.width<600,hasTouch:item.width<600});
  const page=await context.newPage();
  try{
   const issues=[];page.on("pageerror",e=>issues.push(String(e)));
   await page.goto(base+"/",{waitUntil:"domcontentloaded",timeout:20000});
   const landing=await page.evaluate(()=>{
     const rect=s=>{const e=document.querySelector(s);if(!e)throw Error("Missing "+s);const r=e.getBoundingClientRect();return {x:r.left,mid:r.left+r.width/2,width:r.width,y:r.top};};
     const hero=rect(".v6-hero__inner"),h1=rect("#v6-hero-heading"),list=rect(".v6-live__list"),head=rect(".v6-nav"),body=document.body;
     return {hero,h1,list,head,overflow:document.documentElement.scrollWidth-innerWidth,font:getComputedStyle(document.querySelector("h1")).fontFamily,
       hasFakeDashboard:!!document.querySelector(".is3-window,.mock-dashboard,.preview-dashboard")};
   });
   assert.ok(landing.overflow<=4,item.width+"px landing horizontal overflow "+JSON.stringify(landing));
   assert.ok(Math.abs(landing.hero.mid-item.width/2)<6,item.width+"px hero off-center "+JSON.stringify(landing));
   assert.ok(Math.abs(landing.h1.mid-item.width/2)<7,item.width+"px headline off-center "+JSON.stringify(landing));
   assert.ok(landing.font.includes("Inter"),"Finance landing headline typography should use Inter");
   assert.ok(!landing.hasFakeDashboard,"No fake trading dashboard");
   const terminal=page.locator(".v9-hero__visual.v12-terminal");
   assert.equal(await terminal.count(),1,"SEC research preview missing");
   const preview=await terminal.evaluate(el=>{const r=el.getBoundingClientRect();return {center:r.x+r.width/2,width:r.width}});
   assert.ok(Math.abs(preview.center-item.width/2)<=7,item.width+"px preview off center "+JSON.stringify(preview));
   const darkTheme=await page.evaluate(()=>({
    background:getComputedStyle(document.body).backgroundColor,
    headline:getComputedStyle(document.querySelector("#v6-hero-heading")).color,
    chartVisible:!!document.querySelector("#v12-demo-chart"),
    controls:document.querySelectorAll("[data-v12-ticker]").length
   }));
   assert.equal(darkTheme.background,"rgb(8, 14, 20)","Homepage must match dark company interface");
   assert.ok(darkTheme.chartVisible&&darkTheme.controls===4,"Live SEC interactive example unavailable");
   await page.locator('[data-v12-ticker="AAPL"]').click();
   assert.equal(await page.locator('[data-v12-ticker="AAPL"]').getAttribute("aria-pressed"),"true");
   assert.match(await page.locator("#v12-demo-open").getAttribute("href"),/ticker=AAPL/);
   await page.locator('[data-v12-metric="netIncome"]').click();
   assert.equal(await page.locator('[data-v12-metric="netIncome"]').getAttribute("aria-pressed"),"true");
   if(item.width<720){
     const toggle=page.locator("#v6-menu-button");
     assert.ok(await toggle.isVisible(),item.width+"px mobile menu must be visible");
     await toggle.click();
     assert.equal(await toggle.getAttribute("aria-expanded"),"true","Mobile marketing menu doesn't open");
     assert.ok(await page.locator("#v6-menu").isVisible(),"Marketing menu links inaccessible");
     await toggle.click();
   }
   await page.goto(base+"/dashboard.html",{waitUntil:"domcontentloaded",timeout:20000});
   const app=await page.evaluate(()=>{
    const header=document.querySelector(".app-header"),nav=document.querySelector(".app-nav"),main=document.querySelector(".app-main"),h=header.getBoundingClientRect(),m=main.getBoundingClientRect();
    return {headerX:h.x,headerY:h.y,headerW:h.width,headerH:h.height,mainX:m.x,mainW:m.width,mainY:m.y,
      navDisplay:getComputedStyle(nav).display,headerPosition:getComputedStyle(header).position,
      overflow:document.documentElement.scrollWidth-innerWidth,bodyColor:getComputedStyle(document.body).backgroundColor,
      hasData:!!document.getElementById("v3-filings")&&!!document.getElementById("v3-trades")};
   });
   assert.ok(app.overflow<=4,item.width+"px dashboard overflow "+JSON.stringify(app));
   assert.ok(Math.abs(app.headerX)<3&&Math.abs(app.headerW-item.width)<5,"Dashboard has a side navigation, not a top header: "+JSON.stringify(app));
   assert.ok(app.headerY===0,"Header is not at the top");
   assert.ok(["sticky","fixed"].includes(app.headerPosition),"Header must remain at top");
   assert.ok(Math.abs(app.mainX+app.mainW/2-item.width/2)<5,"App main content not centered");
   assert.ok(app.hasData,"SEC research modules missing");
   const dashImage=page.locator(".v9-desk__hero > img");
   assert.equal(await dashImage.count(),1,"Dashboard image missing");
   const imageWidth=await dashImage.evaluate(async img=>{await img.decode();return img.naturalWidth;});
   assert.ok(imageWidth>100,"Dashboard photo failed to load: "+imageWidth);
   assert.equal(await page.locator(".v9-desk__links a").count(),3,"Working dashboard shortcuts missing");
   if(item.width>=1140)assert.notEqual(app.navDisplay,"none","Horizontal desktop navigation missing");
   else {
    const toggle=page.locator(".app-menu-btn");
    assert.ok(await toggle.isVisible(),"Product mobile navigation missing");
    await toggle.click();
    assert.ok(await page.locator(".app-mobile-nav").isVisible(),"Product mobile menu fails");
    await toggle.click();
   }

   // Mock only in this browser test; production reads the actual SEC, market and profile routes.
   const source="https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
   const records=end=>["2021","2022","2023","2024","2025"].map((y,i)=>({periodEnd:y+"-12-31",start:y+"-01-01",value:end(i),filedAt:(Number(y)+1)+"-02-01",form:"10-K",sourceUrl:source}));
   const ttmRow=(value,unit="USD")=>({value,unit,periodStart:"2025-07-01",periodEnd:"2026-06-30",basis:"ttm",sources:[source]});
   const day=86400000,start=Date.UTC(2025,9,14,20);
   const series=(n,step,base)=>Array.from({length:n},(_,i)=>[start+i*step,Math.round((base+i*.4+Math.sin(i/5)*3)*100)/100]);
   await page.route("**/v1/**",async route=>{
    const url=new URL(route.request().url()),ticker=url.searchParams.get("ticker")||"AAPL";
    const company=ticker==="MSFT"?"MICROSOFT CORP":"Apple Inc.";
    const history={};
    for(const [id,label,fn] of [["revenue","Revenue",i=>(i+1)*1e9],["netIncome","Net income",i=>(i-1)*2e8],["operatingIncome","Operating income",i=>(i+1)*4e8],["operatingCashFlow","Operating cash flow",i=>(i+1)*3e8]]){
      history[id]={label,unit:"USD",points:records(fn)};
    }
    const filings=[{form:"10-K",headline:"Annual financial report",filedAt:"2026-02-01",reportDate:"2025-12-31",sourceUrl:source,accession:"0000320193-26-000001"},
      {form:"10-Q",headline:"Quarterly financial report",filedAt:"2026-08-01",reportDate:"2026-06-30",sourceUrl:source,accession:"0000320193-26-000002"},
      {form:"8-K",headline:"Company current report",filedAt:"2026-09-01",reportDate:"2026-08-31",sourceUrl:source,accession:"0000320193-26-000003",items:[{code:"2.02",label:"Results of operations and financial condition"}]}];
    const range=url.searchParams.get("range")||"1Y";
    const points=range==="1Y"?series(250,day,180):range==="1D"?series(78,300000,228):series(60,day,200);
    const activity=[
      {accession:"a1",form:"4",filedAt:"2026-09-14",transactionDate:"2026-09-12",owner:{name:"COOK TIMOTHY D",cik:"12345",role:"Chief Executive Officer · Director"},kind:"sale",code:"S",codeLabel:"Open-market sale",netShares:-12500,value:325000,sharesAfter:3000000,transactions:[],sourceUrl:source},
      {accession:"a2",form:"4",filedAt:"2026-07-09",transactionDate:"2026-07-07",owner:{name:"OTHER PUBLIC FILER",cik:"67890",role:"Director"},kind:"purchase",code:"P",codeLabel:"Open-market purchase",netShares:1500,value:42000,sharesAfter:9000,transactions:[],sourceUrl:source}];
    const fixture=url.pathname==="/v1/intelligence"?{company:{ticker,name:company,cik:"0000320193"},currency:"USD",profile:{exchange:"NASDAQ",headquarters:{label:"Cupertino, CA"},industry:"Electronic Computers",fiscalYearEnd:"September 26"},
        facts:[{id:"assets",label:"Reported total assets",value:5e11,periodEnd:"2026-06-27",form:"10-Q",sourceUrl:source}],financialHistory:history,filings,warnings:[],dataAsOf:new Date().toISOString(),
        ttm:{revenue:ttmRow(4.1e11),netIncome:ttmRow(1.1e11),operatingIncome:ttmRow(1.3e11),operatingCashFlow:ttmRow(1.2e11),eps:ttmRow(7.5,"USD/share")},
        balance:{asOf:"2026-06-27",currency:"USD",cashAndShortTermInvestments:6e10,cash:4e10,totalDebt:9e10,sources:[source]},
        shares:{value:1.5e10,asOf:"2026-07-17",method:"reported",sourceUrl:source}}
      :url.pathname==="/v1/market/chart"?{ticker,range,currency:"USD",exchange:"NasdaqGS",timezone:"America/New_York",price:points.at(-1)[1],previousClose:points.at(-1)[1]-2,change:2,changePercent:.9,
        marketTime:new Date(points.at(-1)[0]).toISOString(),marketState:"closed",rangeChange:5,rangeChangePercent:2,points,source:{name:"Yahoo Finance",url:"https://finance.yahoo.com/quote/"+ticker}}
      :url.pathname==="/v1/company/profile"?{ticker,matched:true,label:ticker==="MSFT"?"Microsoft":"Apple Inc.",shortDescription:"American multinational technology company",founded:1976,employees:{value:164000,asOf:"2025-09-27"},
        website:{url:"https://www.apple.com/",label:"apple.com"},summary:{text:"Apple Inc. is an American multinational technology company. It designs consumer electronics. It also sells services.",url:"https://en.wikipedia.org/wiki/Apple_Inc.",license:"CC BY-SA 4.0"},people:[],sources:[]}
      :url.pathname==="/v1/company/insiders"?{company:{ticker,cik:"0000320193"},activity,people:[{name:"COOK TIMOTHY D",cik:"12345",role:"Chief Executive Officer · Director",filings:1,lastFiled:"2026-09-14",sharesAfter:3000000}]}
      :url.pathname==="/v1/company/news"?{announcements:[{title:"Results of operations and financial condition",form:"8-K",filedAt:"2026-09-01",url:source,earnings:true}],headlines:[],headlinesAvailable:true}
      :url.pathname==="/v1/me/watchlist"?route.request().method()==="POST"?{saved:true}:{items:[]}:null;
    if(fixture!==null)await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixture)});
    else await route.fulfill({status:404,contentType:"application/json",body:"{}"});
   });
   await page.goto(base+"/company.html?ticker=AAPL",{waitUntil:"domcontentloaded",timeout:20000});
   await page.locator("#cx-chart svg path").first().waitFor({timeout:10000});
   await page.locator("#cx-facts dd").filter({hasText:"T"}).first().waitFor({timeout:10000});
   assert.equal(await page.locator("#cx-name").innerText(),"Apple");
   assert.match(await page.locator("#cx-price").innerText(),/^\$\d/);
   assert.match(await page.locator("#cx-change").innerText(),/\+2\.00 \(\+0\.90%\)/);
   const facts=await page.locator("#cx-facts").innerText();
   for(const label of ["Market cap","Enterprise value","P/E ratio","Revenue (TTM)","Net income (TTM)","Employees","Headquarters","Founded","Website"])assert.ok(facts.includes(label),"Key fact missing: "+label);
   assert.match(facts,/Cupertino, CA/);
   assert.match(facts,/164,000/);
   await page.locator('[data-range="1D"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-range="1D"]').classList.contains("is-active")&&document.querySelector("#cx-chart .baseline"));
   assert.equal(await page.locator("#cx-chart .baseline").count(),1,"1D chart should mark the previous close");
   assert.equal(await page.locator("#cx-fin-rows > div").count(),4,"Overview financials need four TTM rows");
   assert.equal(await page.locator("#cx-filing-rows > a").count(),3);
   assert.equal(await page.locator("#cx-insider-rows > div").count(),2);
   assert.match(await page.locator("#cx-insider-rows").innerText(),/Timothy Cook[\s\S]*−12,500/);
   await page.locator("#tab-filings").click();
   assert.ok(await page.locator("#filings").isVisible(),"SEC filings tab should open");
   assert.equal(await page.locator("#cx-filings-table tr").count(),3);
   await page.locator('#cx-filing-filters [data-filter="annual"]').click();
   assert.equal(await page.locator("#cx-filings-table tr").count(),1,"Filings should filter to annual reports");
   await page.locator("#tab-insiders").click();
   await page.locator('#cx-insider-filters [data-filter="buy"]').click();
   assert.equal(await page.locator("#cx-insiders-table tr").count(),1,"Insider transactions must filter");
   await page.locator("#tab-financials").click();
   assert.ok(await page.locator("#cx-statements table").isVisible(),"Annual statements table missing");
   await page.locator('#cx-annual-metrics [data-metric="netIncome"]').click();
   assert.equal(await page.locator("#cx-annual-chart > div").count(),5);
   await page.locator("#tab-news").click();
   await page.locator("#cx-announcements a").first().waitFor({timeout:10000});
   await page.locator("#tab-overview").click();
   await page.locator("#cx-watch").click();
   await page.waitForFunction(()=>document.querySelector("#cx-watch")?.getAttribute("aria-pressed")==="true",null,{timeout:10000});
   assert.match(await page.locator("#cx-watch").innerText(),/On watchlist/,"Watchlist action should persist through the API");
   await page.goto(base+"/company.html?ticker=MSFT",{waitUntil:"domcontentloaded",timeout:20000});
   await page.locator("#cx-name").getByText("Microsoft").waitFor({timeout:10000});
   await page.locator("#cx-chart svg path").first().waitFor({timeout:10000});
   const companyTheme=await page.evaluate(()=>{
     const color=s=>getComputedStyle(document.querySelector(s)).color;
     const back=s=>getComputedStyle(document.querySelector(s)).backgroundColor;
     return {name:color("#cx-name"),facts:color("#cx-facts-title"),price:color("#cx-price"),tabs:back("#cx-tabs"),card:back(".cx-quote"),body:back("body"),
       overflow:document.documentElement.scrollWidth-innerWidth,chartWidth:document.querySelector("#cx-chart").getBoundingClientRect().width};
   });
   for(const key of ["name","facts","price"]){
     const found=companyTheme[key].match(/[0-9]+/g)?.map(Number)||[];
     assert.ok(found.length>=3 && found.slice(0,3).every(v=>v>=200),key+" should be readable light text, found "+JSON.stringify(companyTheme));
   }
   assert.ok(!companyTheme.tabs.includes("255, 255, 255"),"Company tabs must never have a white background");
   assert.match(companyTheme.body,/rgb\(10,\s*14,\s*19\)/,"Company report should use the dark finance UI");
   assert.ok(companyTheme.overflow<=4,item.width+"px company report horizontal overflow "+JSON.stringify(companyTheme));
   assert.ok(companyTheme.chartWidth>200,"Price chart too narrow "+JSON.stringify(companyTheme));
   assert.deepEqual(issues,[],"Company report browser errors: "+issues.join("; "));
   await page.unrouteAll();

   for(const route of ["/signin.html","/signup.html"]){
    await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:20000});
    assert.ok(await page.locator("[data-auth-form]").isVisible(),route+" auth form unavailable");
    const auth=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,serif:getComputedStyle(document.querySelector(".auth-title")).fontFamily}));
    assert.ok(auth.overflow<=4,route+" horizontal overflow "+JSON.stringify(auth));
    assert.match(auth.serif,/Source Serif/);
   }
   console.log("V9 browser verified:",item.width+"px","centered landing","horizontal top navigation","live SEC panels","working auth","no overflow");
   assert.deepEqual(issues,[],"Uncaught browser exceptions: "+issues.join("; "));
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}

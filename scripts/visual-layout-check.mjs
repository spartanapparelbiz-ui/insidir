/* Insidir browser gate at 375, 390 and 1440px: the landing page (src/landing.mjs, rendered from fictional rows), the
   rebuilt app on ui.css (Today, the ticker page, Alerts; /v1 answered from scripts/fixtures/ui-api.json) and the
   sign-in pages: no overflow, one typeface, the shell's navigation, real data on screen, no browser errors. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {serveStatic} from "../src/web.mjs";
import {renderLanding} from "../src/landing.mjs";
import {uiAnswer} from "./fixtures/ui-api.mjs";
import {chromium} from "playwright-core";
const document_has_halftone=html=>/data-halftone-(hero|footer)/.test(html);
// The landing page from fictional rows (the same shape src/landing.mjs reads from PostgreSQL).
const row=(i,extra={})=>({id:"r"+i,accession:"a"+i,issuer_cik:"0000000099",ticker:["EXMP","SMPL","DEMO"][i%3],owner_cik:"4"+i,owner_name:["DOE JANE","ROE RICHARD","LEE MORGAN"][i%3],
  transaction_date:"2026-10-1"+i,transaction_code:"P",derivative:false,shares:"10000",shares_after:"40000",price_per_share:"24.00",estimated_value:String(1200000-i*100000),
  source_url:"https://www.sec.gov/Archives/edgar/data/99/x"+i+"/form4.xml",issuer_name:"EXAMPLE CORP",published_at:new Date(Date.now()-(i+1)*14*60000).toISOString(),rule_10b5_1:false,role:"director",...extra});
const series=Array.from({length:120},(_,i)=>[new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10),20+i/8+Math.sin(i/6)]);
const LANDING=renderLanding({live:[0,1,2,3].map(i=>row(i)),counters:{filings_today:1284,trades_month:18906},buys:[0,1,2].map(i=>row(i)),testimonials:[],today:"2026-10-23",
  receipts:[{ticker:"EXMP",insiders:2,total:3100000,start:"2026-06-01",filing:"https://www.sec.gov/x",d30:{r:.041},d90:{r:-.023}}],
  shot:{top:row(0),series,score:{score:63,band:"Medium"}}},{origin:"http://127.0.0.1"});
const server=createServer((req,res)=>{if(req.url==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(LANDING);return;}serveStatic(req,res).then(found=>{if(!found){res.writeHead(404);res.end("not found");}}).catch(e=>{res.writeHead(500);res.end(String(e));});});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||"/opt/pw-browsers/chromium",args:["--no-sandbox","--disable-dev-shm-usage","--disable-lcd-text","--font-render-hinting=none"]});
 for(const item of [{width:375,height:812},{width:390,height:844},{width:1440,height:900}]){
  const context=await browser.newContext({viewport:item,deviceScaleFactor:1,isMobile:item.width<600,hasTouch:item.width<600});
  // Tools that measure the page see every scroll-reveal block in place (v13-motion.js holds blocks below the fold back until they scroll in).
  await context.addInitScript(() => {
    // Every scroll-reveal block in place at once; a block let go from .hf-pending may start a transition of its own
    // from the hidden state (28px low, transparent), so that is finished too and measurements see the final layout.
    const go = () => {
      const M = window.InsidirMotion;
      if (!M) return;
      const held = new Set(document.querySelectorAll(".hf-pending,.hf-revealing"));
      M.revealAll();
      if (held.size) for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect && held.has(a.effect.target)) { try { a.finish(); } catch {} }
    };
    addEventListener("DOMContentLoaded", () => setTimeout(go, 0));
    addEventListener("load", go);
  });
  const page=await context.newPage();
  try{
   const issues=[];page.on("pageerror",e=>issues.push(String(e)));
   // ---------- the landing page (src/landing.mjs, rendered from fictional rows) ----------
   await page.goto(base+"/",{waitUntil:"load",timeout:20000});
   const landing=await page.evaluate(()=>{
     const r=s=>{const e=document.querySelector(s);if(!e)throw Error("Missing "+s);const b=e.getBoundingClientRect();return {x:b.left,mid:b.left+b.width/2,width:b.width,y:b.top,visible:b.width>0&&b.height>0};};
     return {h1:r(".shero__h1"),search:r(".ssearch"),overflow:document.documentElement.scrollWidth-innerWidth,
       font:getComputedStyle(document.querySelector("h1")).fontFamily,bg:getComputedStyle(document.body).backgroundColor,
       navTargets:[...document.querySelectorAll(".snav__links a")].map(a=>a.getAttribute("href")),
       starts:[...document.querySelectorAll('a[href="/signup.html"][data-cta]')].map(a=>a.textContent.trim()),
       chips:[...document.querySelectorAll(".schips .chip")].map(a=>a.getAttribute("href")),
       shot:!!document.querySelector(".shot .shot__hero"),footer:/Research, not investment advice/.test(document.querySelector("footer")?.textContent||""),
       images:[...document.images].filter(i=>i.getBoundingClientRect().width>2&&!/\.svg/.test(i.currentSrc)&&/\/assets\//.test(i.currentSrc)).map(i=>({src:i.currentSrc,scale:i.getBoundingClientRect().width/(i.naturalWidth||1)}))};
   });
   assert.ok(landing.overflow<=4,item.width+"px landing horizontal overflow "+JSON.stringify(landing));
   assert.ok(Math.abs(landing.h1.mid-item.width/2)<6&&Math.abs(landing.search.mid-item.width/2)<6,item.width+"px hero headline and search must be centred "+JSON.stringify(landing));
   assert.match(landing.font,/^"?Geist"?,/,"Landing headline must use the one typeface, Geist: "+landing.font);
   assert.equal(landing.bg,"rgb(12, 12, 11)","Landing must sit on the night background");
   assert.deepEqual(landing.navTargets,["#how","#pricing","#faq"],"The nav is a map of the page");
   assert.ok(landing.starts.length>=3&&landing.starts.every(t=>t==="Start for $1"),"Every button to sign-up says Start for $1: "+JSON.stringify(landing.starts));
   assert.deepEqual(landing.chips,["/NVDA","/TSLA","/AAPL"],"Three example stocks under the search box");
   assert.ok(landing.shot,"The product shot is drawn from the app's own parts");
   assert.ok(landing.footer,"Every page keeps the research-not-advice line");
   for(const img of landing.images)assert.ok(img.scale<=0.5+1e-6,"Landing image is upscaled on high-density screens: "+JSON.stringify(img));
   assert.ok(!document_has_halftone(await page.content()),"The halftone theme is gone from the landing page");

   // ---------- the rebuilt app (ui.css): Today, the ticker page and Alerts, answered from scripts/fixtures/ui-api.json ----------
   await page.route("**/v1/**",async route=>{
    const u=new URL(route.request().url()),body=uiAnswer(u.pathname,route.request().method());
    await route.fulfill({status:body?200:404,contentType:"application/json",body:JSON.stringify(body||{error:"not in the fixture"})});
   });
   const shell=async()=>page.evaluate(()=>{
     const box=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect(),cs=getComputedStyle(e);return {x:b.left,y:b.top,w:b.width,h:b.height,shown:cs.display!=="none"&&b.width>0,position:cs.position};};
     return {side:box(".side"),tabs:box(".tabs-m"),search:box(".top__search"),overflow:document.documentElement.scrollWidth-innerWidth,
       bg:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily,advice:/Research, not investment advice/.test(document.body.textContent)};
   });
   const checkShell=(name,s)=>{
     assert.ok(s.overflow<=4,item.width+"px "+name+" horizontal overflow "+JSON.stringify(s));
     assert.equal(s.bg,"rgb(12, 12, 11)",name+" sits on the night background");
     assert.match(s.font,/^"?Geist"?,/,name+" uses Geist");
     assert.ok(s.advice,name+" keeps the research-not-advice line");
     assert.ok(s.search?.shown,name+": the search a stock, insider or fund box is always there");
     if(item.width>=1024)assert.ok(s.side?.shown&&Math.abs(s.side.x)<2,name+": desktop has the left sidebar "+JSON.stringify(s.side));
     else assert.ok(s.tabs?.shown&&s.tabs.position==="fixed",name+": phones have the bottom tab bar "+JSON.stringify(s.tabs));
   };
   await page.goto(base+"/dashboard.html",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>document.querySelectorAll("[data-feed] li").length>2&&document.querySelector("[data-hero] .hero__num"),null,{timeout:15000});
   checkShell("Today",await shell());
   const today=await page.evaluate(()=>({hero:document.querySelector("[data-hero] .hero__num").getAttribute("aria-label"),
     filings:[...document.querySelectorAll("[data-feed] a[href^='/filing.html?accession=']")].length,strip:document.querySelectorAll("[data-strip] .wcard").length}));
   assert.match(today.hero,/^\$\d/,"Today's hero is the biggest insider move, in dollars");
   assert.ok(today.filings>0,"Feed rows open their SEC filings inside Insidir");
   assert.ok(today.strip>0,"The watchlist strip shows the watched stocks");
   await page.locator("[data-chart] canvas").first().waitFor({timeout:10000});

   await page.goto(base+"/company.html?ticker=PLHD",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>document.querySelector("#pan-insiders table tbody tr"),null,{timeout:15000});
   checkShell("Ticker page",await shell());
   assert.match(await page.locator("[data-tk-name]").innerText(),/Placeholder Brands/);
   assert.match((await page.locator("[data-tk-price]").innerText()).replace(/\s/g,""),/^\$\d/);
   await page.locator("[data-chart] canvas, .chart canvas").first().waitFor({timeout:10000});
   await page.locator("#tab-filings").click();
   assert.ok(await page.locator("#pan-filings").isVisible(),"Filings tab opens");
   await page.locator("[data-tk-watchbtn]").click();
   await page.waitForFunction(()=>document.querySelector("[data-tk-watchbtn]").getAttribute("aria-pressed")!==null,null,{timeout:5000});

   await page.goto(base+"/alerts.html",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>document.querySelectorAll("[data-al-list] .al").length>3,null,{timeout:15000});
   checkShell("Alerts",await shell());
   assert.match(await page.locator("[data-al-count]").innerText(),/unread|caught up/);

   // The SEC filing inside the app (filing.html): the whole form as filed, the original on SEC.gov linked.
   await page.goto(base+"/filing.html?accession=000000004226000015",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>document.querySelector("[data-fl-doc]")?.getAttribute("aria-busy")==="false"&&document.querySelectorAll(".fl-table tbody tr").length>=3,null,{timeout:15000});
   checkShell("Filing",await shell());
   assert.match(await page.locator("[data-fl-doc]").innerText(),/Form 4[\s\S]*Statement of Changes in Beneficial Ownership[\s\S]*Table I[\s\S]*Table II[\s\S]*Explanation of responses[\s\S]*Weighted average price/,"the filing's form, both tables and its footnotes are in the app");
   assert.equal(await page.locator("[data-fl-original]").getAttribute("href"),"https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml","the original on SEC.gov is linked");
   assert.match(await page.locator(".fl-table").first().innerText(),/\$78\.6025/,"the price exactly as filed");
   const fl=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,wraps:[...document.querySelectorAll(".fl-table-wrap")].every(w=>getComputedStyle(w).overflowX==="auto")}));
   assert.ok(fl.overflow<=4&&fl.wraps,"the form's wide tables scroll inside their own box, the page never does: "+JSON.stringify(fl));
   assert.deepEqual(issues,[],"Browser errors on the rebuilt pages: "+issues.join("; "));
   await page.unrouteAll();

   // /start only redirects to sign-up now (Insidir sends no email, so there is no email-code page).
   await page.goto(base+"/start",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForURL(/\/signup\.html$/,{timeout:10000});
   for(const route of ["/signin.html","/signup.html","/forgot-password.html"]){
    await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:20000});
    if(route==="/forgot-password.html")assert.ok(await page.locator('a[href="mailto:hello@aethric.llc"]').isVisible(),"forgot-password says who to write to");
    else assert.ok(await page.locator("[data-auth-form]").isVisible(),route+" form unavailable");
    const auth=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,heading:getComputedStyle(document.querySelector("h1")).fontFamily,
      headingColor:getComputedStyle(document.querySelector("h1")).color,bg:getComputedStyle(document.body).backgroundColor,
      logo:!!document.querySelector(".au-top .wordmark svg[viewBox=\"70 -793 4531 803\"]"),advice:/Research, not investment advice/.test(document.body.textContent)}));
    assert.ok(auth.overflow<=4,route+" horizontal overflow "+JSON.stringify(auth));
    assert.match(auth.heading,/^"?Geist"?,/,route+" uses Geist, like the rest of the app");
    assert.equal(auth.headingColor,"rgb(240, 238, 232)",route+" heading is full ink");
    assert.equal(auth.bg,"rgb(12, 12, 11)",route+" sits on the night background");
    assert.ok(auth.logo&&auth.advice,route+" has the SVG wordmark and the research-not-advice line");
   }
   console.log("Browser verified:",item.width+"px","landing","Today","ticker page","Alerts","SEC filing","working auth","no overflow");
   assert.deepEqual(issues,[],"Uncaught browser exceptions: "+issues.join("; "));
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}

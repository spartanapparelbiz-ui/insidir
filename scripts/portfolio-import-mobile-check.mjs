#!/usr/bin/env node
/* Browser smoke test for CSV portfolio upload: real static page, local file picker, mocked private API.
 * Tests 375px and 390px phones plus 1440px desktop. No actual brokerage files or live subscriptions.
 * Run after npm install --no-save playwright-core and with CHROME_BIN set. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {serveStatic} from "../src/web.mjs";
import {chromium} from "playwright-core";

const server=createServer(async(req,res)=>{
  try {
    if(!await serveStatic(req,res)){res.writeHead(404);res.end("Not found");}
  }catch(e){if(!res.headersSent)res.writeHead(500);res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROME_BIN||"/opt/pw-browsers/chromium",
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  for(const width of [375,390,1440]){
    const context=await browser.newContext({
      viewport:{width,height:844},isMobile:width<600,hasTouch:width<600
    });
    const page=await context.newPage();
    let imported=null;
    await page.route("**/v1/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==="/v1/me/portfolio/import" && route.request().method()==="POST"){
        imported=route.request().postDataJSON();
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
          imported:imported.items.length,newlyFollowed:2,quantitiesSaved:2,quantitiesNotSaved:0
        })});
      }
      if(path==="/v1/me/manual-holdings"){
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({items:[],recentSecActivity:[]})});
      }
      if(path==="/v1/me/brokerage/status"){
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({available:false,connected:false})});
      }
      return route.fulfill({status:404,contentType:"application/json",body:'{"error":"Unconfigured browser fixture"}'});
    });
    await page.goto(base+"/portfolio.html",{waitUntil:"domcontentloaded",timeout:20000});
    const input=page.locator("#portfolio-csv-file");
    assert.equal(await input.count(),1,width+"px file control");
    assert.equal(await page.locator("#portfolio-csv-confirm").isVisible(),false);
    const csv='Symbol,Description,Quantity,Account Number\nAAPL,"Apple, Inc.",2.5,SECRET1234\nNVDA,NVIDIA,4,SECRET1234\nCASH,Cash,999,SECRET1234\n';
    await input.setInputFiles({name:"current-holdings.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
    await page.waitForFunction(()=>document.querySelector("#portfolio-csv-summary")?.textContent?.includes("Found 2 unique stocks"),{timeout:10000});
    assert.equal(await page.locator("#portfolio-csv-confirm").isVisible(),true);
    assert.match(await page.locator("#portfolio-csv-preview").innerText(),/AAPL/);
    assert.match(await page.locator("#portfolio-csv-preview").innerText(),/NVDA/);
    assert.doesNotMatch(await page.locator("#portfolio-csv-preview").innerText(),/SECRET1234/);
    await page.locator("#portfolio-csv-confirm").click();
    await page.waitForFunction(()=>document.querySelector("#portfolio-csv-summary")?.textContent?.includes("Imported 2 stocks"),{timeout:10000});
    assert.deepEqual(imported,{items:[{ticker:"AAPL",quantity:"2.5"},{ticker:"NVDA",quantity:"4"}]});
    assert.equal(await page.locator("#portfolio-csv-completed").isVisible(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=4,width+"px: portfolio page horizontal overflow "+overflow);

    // A brokerage transaction report should never be mistaken for current holdings.
    imported=null;
    await input.setInputFiles({name:"trades.csv",mimeType:"text/csv",buffer:Buffer.from("Transaction Date,Symbol,Quantity,Action\n2026-10-23,AAPL,3,BUY\n")});
    await page.waitForFunction(()=>document.querySelector("#portfolio-csv-summary")?.textContent?.includes("transaction history"),{timeout:10000});
    assert.equal(await page.locator("#portfolio-csv-confirm").isVisible(),false);
    assert.equal(imported,null);
    console.log("ok "+width+"px: preview, privacy, confirmed import, history rejection, no overflow");
    await context.close();
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

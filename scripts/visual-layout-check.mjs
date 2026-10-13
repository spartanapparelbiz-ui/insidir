/* Real browser layout regression: verify centered composition at phone and desktop widths.
   Runs against the same static assets served in production; API calls are allowed to
   resolve as unavailable because geometry must be correct even during an outage. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {serveStatic} from "../src/web.mjs";
import {chromium} from "playwright-core";

const server=createServer((req,res)=>{serveStatic(req,res).then(done=>{if(!done){res.writeHead(404);res.end("not found");}}).catch(e=>{res.writeHead(500);res.end(e.message);});});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const chrome=process.env.CHROME_BIN||"/usr/bin/google-chrome";
let browser;
const detail=(value)=>Math.round(value*100)/100;
try{
 browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(const cfg of [{name:"iPhone width",width:390,height:844},{name:"small iPhone width",width:375,height:812},{name:"desktop width",width:1440,height:900}]){
  const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},deviceScaleFactor:1,hasTouch:cfg.width<600,isMobile:cfg.width<600});
  const page=await context.newPage();
  try{
   await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:20000});
   const landing=await page.evaluate(()=>{
    const center=(selector)=>{const e=document.querySelector(selector);if(!e)throw Error("Missing "+selector);const r=e.getBoundingClientRect();return {x:r.x,width:r.width,mid:r.x+r.width/2}};
    const vw=document.documentElement.clientWidth;
    const hero=center(".is3-hero__center"),strip=center(".v5-hero-live-wrap"),head=center(".is3-section-head"),nav=center(".is3-nav__inner");
    return {vw,hero,strip,head,nav,overflow:document.documentElement.scrollWidth-window.innerWidth};
   });
   assert.ok(Math.abs(landing.hero.mid-cfg.width/2)<=5,cfg.name+": hero off center "+JSON.stringify(landing));
   assert.ok(Math.abs(landing.strip.mid-cfg.width/2)<=5,cfg.name+": live filing strip off center "+JSON.stringify(landing));
   assert.ok(Math.abs(landing.head.mid-cfg.width/2)<=7,cfg.name+": marketing section headline off center "+JSON.stringify(landing));
   assert.ok(landing.overflow<=5,cfg.name+": site overflows viewport by "+landing.overflow+"px");
   await page.locator(".is4-explorer__identity").scrollIntoViewIfNeeded();
   const mark=await page.evaluate(()=>{
    const p=document.querySelector(".is4-explorer__symbol"),r=p.getBoundingClientRect(),c=document.querySelector(".is4-explorer__identity").getBoundingClientRect();
    const logo=p.querySelector(".ins-media"),l=logo.getBoundingClientRect();
    return {symbolCenter:r.x+r.width/2,photoCenter:l.x+l.width/2,identityCenter:c.x+c.width/2,
      logoWidth:l.width,imagePosition:getComputedStyle(logo.querySelector("img")).position,
      identityDirection:getComputedStyle(document.querySelector(".is4-explorer__identity")).flexDirection};
   });
   assert.ok(Math.abs(mark.photoCenter-mark.symbolCenter)<=2,cfg.name+": logo box off center "+JSON.stringify(mark));
   assert.equal(mark.imagePosition,"absolute",cfg.name+": logo should be centered in a stable image box");
   if(cfg.width<600)assert.ok(Math.abs(mark.photoCenter-cfg.width/2)<=10,cfg.name+": mobile company logo off center "+JSON.stringify(mark));
   await page.goto(origin+"/dashboard.html",{waitUntil:"domcontentloaded",timeout:20000});
   const dashboard=await page.evaluate(()=>{
    const main=document.querySelector(".v3-main"),intro=document.querySelector(".v3-intro"),m=main.getBoundingClientRect(),r=intro.getBoundingClientRect();
    const nav=document.querySelector(".app-header"),side=innerWidth>860?nav.getBoundingClientRect().width:0;
    const centerExpected=(side+innerWidth)/2;
    const filler='<tr><td>Verified insider</td><td>MSFT</td><td>Oct 12, 2026</td><td>Purchase</td><td>$10,000</td></tr>';
    document.getElementById("v3-trades").innerHTML=filler;
    const row=document.querySelector("#v3-trades tr");
    const photo=document.createElement("span");photo.className="ins-media ins-media--person ins-media--sm ins-media--missing";photo.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>';
    row.querySelector("td").prepend(photo);
    const p=photo.getBoundingClientRect();
    return {introMid:r.x+r.width/2,expected:centerExpected,mainLeft:m.left,mainWidth:m.width,
      side,overflow:document.documentElement.scrollWidth-window.innerWidth,
      rowDisplay:getComputedStyle(row).display,imageBoxMid:p.left+p.width/2};
   });
   assert.ok(Math.abs(dashboard.introMid-dashboard.expected)<=8,cfg.name+": dashboard workspace off-center "+JSON.stringify(dashboard));
   assert.ok(dashboard.overflow<=5,cfg.name+": dashboard overflows by "+dashboard.overflow+"px");
   if(cfg.width<600)assert.equal(dashboard.rowDisplay,"grid",cfg.name+": mobile record must use stacked card geometry");
   console.log("Layout verified: "+cfg.name+" / "+cfg.width+"px. Hero, company mark and dashboard centered; overflow "+detail(landing.overflow)+"/"+detail(dashboard.overflow)+"px");
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

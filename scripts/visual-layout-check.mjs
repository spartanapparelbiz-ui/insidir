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
   assert.ok(landing.font.includes("Source Serif"),"Original Source Serif heading lost");
   assert.ok(!landing.hasFakeDashboard,"Landing has a fake dashboard preview");
   const cover=page.locator(".v9-hero__visual img");
   assert.equal(await cover.count(),1,"Editorial landing image missing");
   const coverWidth=await cover.evaluate(async img=>{await img.decode();return img.naturalWidth;});
   assert.ok(coverWidth>100,"Landing image not loaded: "+coverWidth);
   const coverGeometry=await page.locator(".v9-hero__visual").evaluate(el=>{const r=el.getBoundingClientRect();return {center:r.x+r.width/2,width:r.width}});
   assert.ok(Math.abs(coverGeometry.center-item.width/2)<=7,item.width+"px photo cover off center "+JSON.stringify(coverGeometry));
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

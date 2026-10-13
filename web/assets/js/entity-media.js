/* Brand and public-person imagery. No generated portraits or inferred identities.
 * Brands: vetted ticker -> company-domain mapping; real published brand marks.
 * People: exact (ticker, reported owner) aliases -> verified encyclopedia biography,
 * and only its free-license page image. Others retain a neutral icon, never a fake face.
 */
(() => {
"use strict";
const brands={
 AAPL:["apple","apple.com"],MSFT:["microsoft","microsoft.com"],NVDA:["nvidia","nvidia.com"],
 TSLA:["tesla","tesla.com"],GOOG:["google","abc.xyz"],GOOGL:["google","abc.xyz"],
 AMZN:["amazon","amazon.com"],META:["meta","meta.com"],AMD:["amd","amd.com"],
 INTC:["intel","intel.com"],NFLX:["netflix","netflix.com"],ADBE:["adobe","adobe.com"],
 ORCL:["oracle","oracle.com"],CRM:["salesforce","salesforce.com"],IBM:["ibm","ibm.com"],
 CSCO:["cisco","cisco.com"],QCOM:["qualcomm","qualcomm.com"],PYPL:["paypal","paypal.com"],
 SQ:["square","block.xyz"],XYZ:["square","block.xyz"],SHOP:["shopify","shopify.com"],
 UBER:["uber","uber.com"],SPOT:["spotify","spotify.com"],COIN:["coinbase","coinbase.com"],
 ABNB:["airbnb","airbnb.com"],SNAP:["snapchat","snap.com"],PINS:["pinterest","pinterest.com"],
 DIS:["disney","thewaltdisneycompany.com"],WMT:["walmart","walmart.com"],TGT:["target","target.com"],
 COST:["costco","costco.com"],NKE:["nike","nike.com"],SBUX:["starbucks","starbucks.com"],
 KO:["cocacola","coca-colacompany.com"],PEP:["pepsi","pepsico.com"],MCD:["mcdonalds","mcdonalds.com"],
 V:["visa","visa.com"],MA:["mastercard","mastercard.com"],AXP:["americanexpress","americanexpress.com"],
 BA:["boeing","boeing.com"],CAT:["caterpillar","caterpillar.com"],GE:["ge","ge.com"],
 JPM:[null,"jpmorganchase.com"],GS:[null,"goldmansachs.com"],MS:[null,"morganstanley.com"],
 BAC:[null,"bankofamerica.com"],C:[null,"citigroup.com"],WFC:[null,"wellsfargo.com"],
 JEF:[null,"jefferies.com"],PANW:[null,"paloaltonetworks.com"],CRWD:[null,"crowdstrike.com"],
 NOW:[null,"servicenow.com"],PLTR:[null,"palantir.com"],SNOW:[null,"snowflake.com"],
 DDOG:[null,"datadoghq.com"],NET:[null,"cloudflare.com"],MDB:[null,"mongodb.com"],
 HOOD:[null,"robinhood.com"],RBLX:[null,"roblox.com"],
 F:[null,"ford.com"],GM:[null,"gm.com"],TM:[null,"global.toyota"],HMC:[null,"honda.com"],
 PFE:[null,"pfizer.com"],JNJ:[null,"jnj.com"],MRK:[null,"merck.com"],ABBV:[null,"abbvie.com"],
 LLY:[null,"lilly.com"],UNH:[null,"unitedhealthgroup.com"],NVO:[null,"novonordisk.com"],
 XOM:[null,"exxonmobil.com"],CVX:[null,"chevron.com"],COP:[null,"conocophillips.com"],
 OXY:[null,"oxy.com"],NEE:[null,"nexteraenergy.com"],DUK:[null,"duke-energy.com"],
 UPS:[null,"ups.com"],FDX:[null,"fedex.com"],DAL:[null,"delta.com"],UAL:[null,"united.com"],
 NTRA:[null,"natera.com"],NEOG:[null,"neogen.com"],BETA:[null,"betabionics.com"],
 MAX:[null,"mediaalpha.com"],ONMD:[null,"onemednet.com"],WRAP:[null,"wrap.com"],
 MU:[null,"micron.com"],ARM:[null,"arm.com"],AVGO:[null,"broadcom.com"],TXN:[null,"ti.com"],
 BKNG:[null,"bookingholdings.com"],EBAY:[null,"ebayinc.com"],ETSY:[null,"etsy.com"],
 ROKU:[null,"roku.com"],DELL:[null,"dell.com"],HPQ:[null,"hp.com"],HPE:[null,"hpe.com"],
 "BRK.A":[null,"berkshirehathaway.com"],"BRK.B":[null,"berkshirehathaway.com"]
};
const portraits={
 "AAPL:COOK TIMOTHY D":["Tim Cook","Tim_Cook"],"AAPL:TIM COOK":["Tim Cook","Tim_Cook"],
 "AAPL:TIMOTHY D COOK":["Tim Cook","Tim_Cook"],
 "MSFT:NADELLA SATYA":["Satya Nadella","Satya_Nadella"],"MSFT:SATYA NADELLA":["Satya Nadella","Satya_Nadella"],
 "NVDA:HUANG JEN HSUN":["Jensen Huang","Jensen_Huang"],"NVDA:HUANG JENSEN":["Jensen Huang","Jensen_Huang"],
 "NVDA:JENSEN HUANG":["Jensen Huang","Jensen_Huang"],
 "TSLA:MUSK ELON":["Elon Musk","Elon_Musk"],"TSLA:ELON MUSK":["Elon Musk","Elon_Musk"],
 "META:ZUCKERBERG MARK":["Mark Zuckerberg","Mark_Zuckerberg"],"META:MARK ZUCKERBERG":["Mark Zuckerberg","Mark_Zuckerberg"],
 "GOOG:PICHAI SUNDAR":["Sundar Pichai","Sundar_Pichai"],
 "GOOGL:PICHAI SUNDAR":["Sundar Pichai","Sundar_Pichai"],
 "AMD:SU LISA T":["Lisa Su","Lisa_Su"],"AMD:LISA SU":["Lisa Su","Lisa_Su"],
 "AMZN:JASSY ANDREW R":["Andy Jassy","Andy_Jassy"],"AMZN:JASSY ANDY":["Andy Jassy","Andy_Jassy"],
 "AMZN:BEZOS JEFFREY P":["Jeff Bezos","Jeff_Bezos"],
 "JPM:DIMON JAMES":["Jamie Dimon","Jamie_Dimon"],
 "ORCL:ELLISON LAWRENCE J":["Larry Ellison","Larry_Ellison"],
 "CRM:BENIOFF MARC":["Marc Benioff","Marc_Benioff"],
 "DELL:DELL MICHAEL S":["Michael Dell","Michael_Dell"]
};
const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalize=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
const normalizeTicker=s=>String(s||"").trim().toUpperCase();
const building='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m3 0h2M9 11h2m3 0h2M9 15h2m3 0h2"/></svg>';
const person='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.6-4.5 3.3-7 7.5-7s6.9 2.5 7.5 7"/></svg>';
const favicon=domain=>"https://www.google.com/s2/favicons?domain="+encodeURIComponent(domain)+"&sz=128";
function logo(ticker, size="sm"){
 const t=normalizeTicker(ticker),brand=brands[t],sz=["sm","md","lg"].includes(size)?size:"sm";
 if(!brand)return '<span class="ins-media ins-media--company ins-media--'+sz+' ins-media--missing" title="Company logo not verified" aria-label="Company logo unavailable">'+building+'</span>';
 const [slug,domain]=brand;
 const url=slug?"https://cdn.simpleicons.org/"+slug:favicon(domain);
 return '<span class="ins-media ins-media--company ins-media--'+sz+'" title="Brand mark for '+html(t)+'">'+
   '<img loading="lazy" decoding="async" alt="" src="'+html(url)+'" data-logo-fallback="'+html(slug?favicon(domain):"")+'">'+building+'</span>';
}
function portrait(owner,ticker,size="sm"){
 const entry=portraits[normalizeTicker(ticker)+":"+normalize(owner)],sz=["sm","md","lg"].includes(size)?size:"sm";
 if(!entry)return '<span class="ins-media ins-media--person ins-media--'+sz+' ins-media--missing" title="No verified public portrait" aria-label="Portrait unavailable">'+person+'</span>';
 return '<span class="ins-media ins-media--person ins-media--'+sz+' ins-media--missing" data-portrait-article="'+html(entry[1])+'" data-portrait-label="'+html(entry[0])+'" title="Verified public portrait loading">'+person+'</span>';
}
const wikiCache=new Map();
async function wikiPhoto(article){
 if(wikiCache.has(article))return wikiCache.get(article);
 const promise=(async()=>{
  const u="https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pilicense=free&pithumbsize=180&titles="+encodeURIComponent(article.replaceAll("_"," "))+"&origin=*";
  const r=await fetch(u,{headers:{Accept:"application/json"}});
  if(!r.ok)return null;
  const response=await r.json();
  const page=response?.query?.pages?.[0];
  const src=page?.thumbnail?.source;
  if(!src||!/^https:\/\/upload\.wikimedia\.org\/wikipedia\//.test(src)||!page.pageimage)return null;
  // The file-description page credits the actual photographer and describes the image license.
  const file="https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(page.pageimage.replaceAll(" ","_"));
  return {src,file};
 })().catch(()=>null);
 wikiCache.set(article,promise);return promise;
}
function observeLogoFailures(root){
 for(const image of root.querySelectorAll("img[data-logo-fallback]:not([data-logo-ready])")){
  image.dataset.logoReady="1";
  image.addEventListener("error",()=>{
   const fallback=image.dataset.logoFallback;
   if(fallback&&!image.dataset.didFallback){image.dataset.didFallback="1";image.src=fallback;}
   else{image.remove();image.closest(".ins-media")?.classList.add("ins-media--missing");}
  });
  image.addEventListener("load",()=>{image.closest(".ins-media")?.classList.remove("ins-media--missing");});
 }
}
function hydrate(root=document){
 if(!root?.querySelectorAll)return;
 observeLogoFailures(root);
 for(const cell of root.querySelectorAll("[data-portrait-article]:not([data-portrait-ready])")){
  cell.dataset.portraitReady="1";
  const article=cell.dataset.portraitArticle,label=cell.dataset.portraitLabel;
  void wikiPhoto(article).then(asset=>{
   if(!asset||!cell.isConnected)return;
   const anchor=document.createElement("a");
   anchor.href=asset.file;anchor.target="_blank";anchor.rel="noopener noreferrer";
   anchor.title="Photograph of "+label+" · source and license on Wikimedia Commons";
   anchor.setAttribute("aria-label","View source and license for photo of "+label);
   const img=document.createElement("img");
   img.src=asset.src;img.loading="lazy";img.decoding="async";img.alt="Portrait of "+label;
   img.addEventListener("load",()=>cell.classList.remove("ins-media--missing"),{once:true});
   img.addEventListener("error",()=>anchor.remove(),{once:true});
   anchor.appendChild(img);cell.appendChild(anchor);
  });
 }
}
window.InsidirMedia=Object.freeze({logo,portrait,hydrate,knownBrand:t=>Boolean(brands[normalizeTicker(t)])});
document.addEventListener("DOMContentLoaded",()=>hydrate());
})();

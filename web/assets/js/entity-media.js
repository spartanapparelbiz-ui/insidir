/* Source-verified real corporate marks and published portraits.
 * No generated images, no inferred headshots, no generic favicon services.
 * Images are referenced from named Wikimedia Commons file pages and display
 * only when the network returns the actual image successfully.
 */
(() => {
"use strict";
const marks=Object.freeze({
  AAPL:{name:"Apple",src:"https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",source:"https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg"},
  MSFT:{name:"Microsoft",src:"https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",source:"https://commons.wikimedia.org/wiki/File:Microsoft_logo.svg"},
  NVDA:{name:"NVIDIA",src:"https://upload.wikimedia.org/wikipedia/commons/4/48/Nvidia_Logo.svg",source:"https://commons.wikimedia.org/wiki/File:Nvidia_Logo.svg"},
  TSLA:{name:"Tesla",src:"https://upload.wikimedia.org/wikipedia/commons/b/bb/Tesla_T_symbol.svg",source:"https://commons.wikimedia.org/wiki/File:Tesla_T_symbol.svg"}
});
const images=Object.freeze({
  "AAPL:COOK TIMOTHY D":"tim-cook",
  "AAPL:TIMOTHY D COOK":"tim-cook",
  "AAPL:TIM COOK":"tim-cook",
  "MSFT:NADELLA SATYA":"satya-nadella",
  "MSFT:SATYA NADELLA":"satya-nadella",
  "NVDA:HUANG JEN HSUN":"jensen-huang",
  "NVDA:HUANG JENSEN":"jensen-huang",
  "NVDA:JENSEN HUANG":"jensen-huang",
  "TSLA:MUSK ELON":"elon-musk",
  "TSLA:ELON MUSK":"elon-musk"
});
const photos=Object.freeze({
 "tim-cook":{name:"Tim Cook",src:"https://upload.wikimedia.org/wikipedia/commons/9/9e/Tim_Cook_%282017%2C_cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Tim_Cook_(2017,_cropped).jpg",credit:"Austin Community College / Catalin Abagiu",license:"CC BY 2.0"},
 "satya-nadella":{name:"Satya Nadella",src:"https://upload.wikimedia.org/wikipedia/commons/4/4a/Satya_Nadella_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Satya_Nadella_(cropped).jpg",credit:"Brian Smale",license:"CC BY-SA 4.0"},
 "jensen-huang":{name:"Jensen Huang",src:"https://upload.wikimedia.org/wikipedia/commons/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Jensen_Huang_(cropped)_(2024).jpg",credit:"European Commission / Peter Dasilva",license:"CC BY 4.0"},
 "elon-musk":{name:"Elon Musk",src:"https://upload.wikimedia.org/wikipedia/commons/3/30/Elon_Musk_close-up_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Elon_Musk_close-up_(cropped).jpg",credit:"U.S. Air Force / Justin Pacheco",license:"Public domain (US federal work)"}
});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeTicker=s=>String(s||"").trim().toUpperCase();
const normalize=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
const companySymbol='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m3 0h2M9 11h2m3 0h2M9 15h2m3 0h2"/></svg>';
const personSymbol='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.6-4.5 3.3-7 7.5-7s6.9 2.5 7.5 7"/></svg>';
function unavailable(kind,size){
  return '<span class="ins-media ins-media--'+kind+' ins-media--'+size+' ins-media--missing" role="img" aria-label="'+(kind==="person"?"No verified photograph":"No verified company mark")+'">'+(kind==="person"?personSymbol:companySymbol)+'</span>';
}
function renderAsset(asset,kind,size){
  const sz=["sm","md","lg"].includes(size)?size:"sm";
  if(!asset)return unavailable(kind,sz);
  const label=kind==="person"?"Portrait of "+asset.name:"Official company mark for "+asset.name;
  const source=kind==="person"?" Photo: "+asset.credit+" · "+asset.license+" · source on Wikimedia Commons.":" Brand mark source: Wikimedia Commons.";
  const image='<img data-real-image src="'+esc(asset.src)+'" alt="'+esc(label)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  const wrap=kind==="person"?
    '<a class="ins-media__credit" href="'+esc(asset.source)+'" target="_blank" rel="noopener noreferrer" title="'+esc(label+source)+'">'+image+'</a>':image;
  return '<span class="ins-media ins-media--'+kind+' ins-media--'+sz+' ins-media--pending" data-real-source="'+esc(asset.source)+'" title="'+esc(label+source)+'">'+(kind==="person"?personSymbol:companySymbol)+wrap+'</span>';
}
function logo(ticker,size="sm"){return renderAsset(marks[normalizeTicker(ticker)],"company",size);}
function portrait(name,ticker,size="sm"){
 const slug=images[normalizeTicker(ticker)+":"+normalize(name)];
 return renderAsset(slug?photos[slug]:null,"person",size);
}
function hydrate(root=document){
 if(!root?.querySelectorAll)return;
 for(const img of root.querySelectorAll("img[data-real-image]:not([data-real-ready])")){
  img.dataset.realReady="1";
  const cell=img.closest(".ins-media");
  img.addEventListener("load",()=>{if(img.naturalWidth>0){cell?.classList.remove("ins-media--pending","ins-media--missing");}},{once:true});
  img.addEventListener("error",()=>{cell?.classList.remove("ins-media--pending");cell?.classList.add("ins-media--missing");img.closest("a.ins-media__credit")?.remove();img.remove();},{once:true});
  if(img.complete&&img.naturalWidth>0)cell?.classList.remove("ins-media--pending","ins-media--missing");
 }
}
window.InsidirMedia=Object.freeze({logo,portrait,hydrate,knownBrand:t=>Boolean(marks[normalizeTicker(t)])});
document.addEventListener("DOMContentLoaded",()=>hydrate());
})();

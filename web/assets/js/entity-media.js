/* Source-verified real corporate marks and published portraits.
 * No generated images, no inferred headshots, no generic favicon services.
 * Images are referenced from named Wikimedia Commons file pages and display
 * only when the network returns the actual image successfully.
 *
 * Sharpness: portraits render as small identity tiles (76 CSS px at most), so they
 * load the Commons 250px thumbnail of each file (≥ 2× the largest rendered size,
 * a few kilobytes instead of multi-megabyte originals). `src` stays the original
 * upload for callers that build their own thumbnail. scripts/verify-media.mjs
 * reads this file and fails if a thumbnail is missing or too small.
 *
 * When there is no verified portrait (or it fails to load) a person is shown as
 * monogram initials and a company as the first letter of its ticker — never an
 * empty photo tile or a grey placeholder.
 */
(() => {
"use strict";
const marks=Object.freeze({
 AAPL:{name:"Apple",src:"assets/icons/apple.svg",source:"https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg"},
 MSFT:{name:"Microsoft",src:"assets/icons/microsoft.svg",source:"https://commons.wikimedia.org/wiki/File:Microsoft_logo.svg"},
 NVDA:{name:"NVIDIA",src:"assets/icons/nvidia.svg",source:"https://commons.wikimedia.org/wiki/File:Nvidia_Logo.svg"},
 TSLA:{name:"Tesla",src:"assets/icons/tesla.svg",source:"https://commons.wikimedia.org/wiki/File:Tesla_T_symbol.svg"},
 META:{name:"Meta",src:"assets/icons/meta.svg",source:"https://about.meta.com/brand/resources/meta/company-brand/"},
 GOOGL:{name:"Alphabet / Google",src:"assets/icons/google.svg",source:"https://about.google/brand-resource-center/"},
 GOOG:{name:"Alphabet / Google",src:"assets/icons/google.svg",source:"https://about.google/brand-resource-center/"},
 ABNB:{name:"Airbnb",src:"assets/icons/airbnb.svg",source:"https://www.airbnb.com/press"},
 AMZN:{name:"Amazon",src:"https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",source:"https://commons.wikimedia.org/wiki/File:Amazon_logo.svg"},
 NFLX:{name:"Netflix",src:"https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg",source:"https://commons.wikimedia.org/wiki/File:Netflix_2015_logo.svg"},
 IBM:{name:"IBM",src:"https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",source:"https://commons.wikimedia.org/wiki/File:IBM_logo.svg"}
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
/* thumb: the Commons 250px rendition (native width 250) used for every on-page portrait. Each file
   is a head-and-shoulders crop, so the small square tiles show a face, not a distant figure. */
const photos=Object.freeze({
 "tim-cook":{name:"Tim Cook",src:"https://upload.wikimedia.org/wikipedia/commons/c/c5/Tim_Cook_%282017%29_%28cropped2%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Tim_Cook_%282017%29_%28cropped2%29.jpg/250px-Tim_Cook_%282017%29_%28cropped2%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Tim_Cook_(2017)_(cropped2).jpg",credit:"Austin Community College / Catalin Abagiu",license:"CC BY 2.0"},
 "satya-nadella":{name:"Satya Nadella",src:"https://upload.wikimedia.org/wikipedia/commons/4/4a/Satya_Nadella_%28cropped%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Satya_Nadella_%28cropped%29.jpg/250px-Satya_Nadella_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Satya_Nadella_(cropped).jpg",credit:"Brian Smale",license:"CC BY-SA 4.0"},
 "jensen-huang":{name:"Jensen Huang",src:"https://upload.wikimedia.org/wikipedia/commons/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg/250px-Jensen_Huang_%28cropped%29_%282024%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Jensen_Huang_(cropped)_(2024).jpg",credit:"European Commission / Peter Dasilva",license:"CC BY 4.0"},
 "elon-musk":{name:"Elon Musk",src:"https://upload.wikimedia.org/wikipedia/commons/3/30/Elon_Musk_close-up_%28cropped%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Elon_Musk_close-up_%28cropped%29.jpg/250px-Elon_Musk_close-up_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Elon_Musk_close-up_(cropped).jpg",credit:"U.S. Air Force / Justin Pacheco",license:"Public domain (US federal work)"}
});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeTicker=s=>String(s||"").trim().toUpperCase();
const normalize=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();

/* ---------- names: SEC files people as "LAST FIRST MIDDLE"; show them as people write them ---------- */
const ENTITY=/\b(INC|LLC|L\.?L\.?C|LP|L\.P|LTD|CORP|CORPORATION|CO|COMPANY|TRUST|FUND|FUNDS|CAPITAL|PARTNERS|HOLDINGS|GROUP|FOUNDATION|BANK|ASSOCIATES|MANAGEMENT|ADVISORS|INVESTMENTS|N\.?V|S\.?A|PLC|AG|SE|LIMITED|VENTURES|ESTATE)\b|&/i;
const ACRONYM=/^(LLC|LP|LLP|PLC|AG|SE|NV|SA|II|III|IV|USA|US|UK|L\.P\.?|N\.A\.?)[.,]?$/;
const titleCase=s=>String(s).toLowerCase().replace(/(^|[\s\-'’(])([a-z])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\/([a-z]{2,3})\//g,(m,a)=>"/"+a.toUpperCase()+"/").split(" ").map(w=>ACRONYM.test(w.toUpperCase())?w.toUpperCase():w).join(" ");
function displayName(raw){
 const name=String(raw||"").replace(/\s+/g," ").trim();
 if(!name)return "Reporting person";
 if(/[a-z]/.test(name))return name;
 if(ENTITY.test(name))return titleCase(name);
 const parts=name.replace(/,/g," ").split(" ").filter(Boolean);
 if(parts.length<2)return titleCase(name);
 const suffix=/^(JR|SR|II|III|IV|V)\.?$/i.test(parts.at(-1))?parts.pop():"";
 const [last,...given]=parts;
 const fix=t=>/^[A-Z]\.?$/.test(t)?t.charAt(0)+".":titleCase(t);
 return [...given.map(fix),fix(last),suffix?(/^(II|III|IV|V)$/.test(suffix)?suffix:titleCase(suffix.replace(/\.$/,""))+"."):""].filter(Boolean).join(" ");
}
/* Initials: the first letter of the first and the last name word, as people write the name.
   Words split on whitespace only, so "Vanderbilt-Worthington" and "O'Brien" stay one word
   (AV, MO); generational suffixes are dropped; organisations use their first two words. */
const SUFFIX=/^(?:[JjSs][Rr]|II|III|IV|V)$/;
function initials(raw){
 const words=displayName(raw).split(/\s+/).map(w=>w.replace(/[^\p{L}\p{N}]/gu,"")).filter(Boolean);
 if(!words.length)return "";
 if(ENTITY.test(String(raw||""))||words.length===1)return (words[0][0]+(words[1]?.[0]||"")).toUpperCase();
 const named=words.filter(w=>!SUFFIX.test(w)),list=named.length?named:words;
 return (list[0][0]+(list.length>1?list.at(-1)[0]:"")).toUpperCase();
}
/* Monogram drawn as SVG text so it scales with whatever tile size the page uses. */
function monogram(text){
 const t=String(text||"").slice(0,2);
 return '<svg class="ins-media__monogram" viewBox="0 0 40 40" style="width:100%;height:100%" aria-hidden="true" focusable="false"><text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-size="'+(t.length>1?14:16)+'" font-weight="600" fill="currentColor">'+esc(t)+'</text></svg>';
}
const companySymbol='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m3 0h2M9 11h2m3 0h2M9 15h2m3 0h2"/></svg>';
function fallback(kind,label){
 if(kind==="person"){const i=initials(label);return i?monogram(i):companySymbol;}
 const t=normalizeTicker(label).replace(/[^A-Z0-9]/g,"");
 return t?monogram(t[0]):companySymbol;
}
function unavailable(kind,size,label){
  return '<span class="ins-media ins-media--'+kind+' ins-media--'+size+' ins-media--missing ins-media--monogram" aria-hidden="true">'+fallback(kind,label)+'</span>';
}
function renderAsset(asset,kind,size,label){
  const sz=["sm","md","lg"].includes(size)?size:"sm";
  if(!asset)return unavailable(kind,sz,label);
  const alt=kind==="person"?"Portrait of "+asset.name:"Official company mark for "+asset.name;
  const source=kind==="person"?" Photo: "+asset.credit+" · "+asset.license+" · source on Wikimedia Commons.":" Brand mark source: Wikimedia Commons.";
  const image='<img data-real-image src="'+esc(kind==="person"&&asset.thumb?asset.thumb:asset.src)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  const wrap=kind==="person"?
    '<a class="ins-media__credit" href="'+esc(asset.source)+'" target="_blank" rel="noopener noreferrer" title="'+esc(alt+source)+'">'+image+'</a>':image;
  return '<span class="ins-media ins-media--'+kind+' ins-media--'+sz+' ins-media--pending ins-media--monogram" data-real-source="'+esc(asset.source)+'" title="'+esc(alt+source)+'">'+fallback(kind,label)+wrap+'</span>';
}
function logo(ticker,size="sm"){return renderAsset(marks[normalizeTicker(ticker)],"company",size,ticker);}
function portrait(name,ticker,size="sm"){
 const slug=images[normalizeTicker(ticker)+":"+normalize(name)];
 return renderAsset(slug?photos[slug]:null,"person",size,name);
}
function hydrate(root=document){
 if(!root?.querySelectorAll)return;
 for(const img of root.querySelectorAll("img[data-real-image]:not([data-real-ready])")){
  img.dataset.realReady="1";
  const cell=img.closest(".ins-media");
  const ready=()=>cell?.classList.remove("ins-media--pending","ins-media--missing");
  const failed=()=>{cell?.classList.remove("ins-media--pending");cell?.classList.add("ins-media--missing");img.closest("a.ins-media__credit")?.remove();img.remove();};
  img.addEventListener("load",()=>{if(img.naturalWidth>0)ready();else failed();},{once:true});
  img.addEventListener("error",failed,{once:true});
  // Static markup can finish (or fail, e.g. when Wikimedia is blocked) before this runs.
  if(img.complete&&img.naturalWidth>0)ready();
  else if(img.complete&&img.loading!=="lazy"&&img.getAttribute("src"))failed();
 }
}
function photo(name,ticker){const slug=images[normalizeTicker(ticker)+":"+normalize(name)];return slug?photos[slug]:null;}
window.InsidirMedia=Object.freeze({logo,portrait,photo,hydrate,displayName,initials,knownBrand:t=>Boolean(marks[normalizeTicker(t)])});
document.addEventListener("DOMContentLoaded",()=>hydrate());
})();

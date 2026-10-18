/* Public research sharing and creator script tools. No third-party tracking. */
(() => {
"use strict";
const $ = (s, root=document) => root.querySelector(s);
const allowed = s => /^[a-z0-9][a-z0-9_-]{2,39}$/.test(s);
const getRef = () => {
 const raw = new URLSearchParams(location.search).get("ref");
 if(raw && allowed(raw.toLowerCase())) return raw.toLowerCase();
 try{const record=JSON.parse(localStorage.getItem("insidir:creator-ref")||"null");
 if(record && record.until>Date.now() && allowed(String(record.code||"")))return record.code;
 }catch(_){}return "";
};
const buildURL = (path) => {
 const u=new URL(path,location.origin);
 const ref=getRef();
 if(ref) u.searchParams.set("ref",ref);
 return u.toString();
};
const say = (el,text) => {const target = (el.closest("[data-share-scope]")||document).querySelector("[data-share-status]");if(target)target.textContent=text;};
async function copy(value) {
 if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);return true;}
 const el=document.createElement("textarea");el.value=value;el.setAttribute("readonly","");el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.select();
 try{return document.execCommand("copy");}finally{el.remove();}
}
document.addEventListener("click",async e=>{
 const link=e.target.closest("[data-copy-link]");
 const script=e.target.closest("[data-copy-script]");
 const native=e.target.closest("[data-native-share]");
 const b=link||script||native;
 if(!b)return;
 const url=buildURL((b.dataset.page||location.pathname));
 let txt=url;
 if(script){const target=document.getElementById(b.dataset.copyScript);if(!target)return;txt=target.innerText.trim();}
 if(native && navigator.share){
  try{await navigator.share({title:document.title,url});say(b,"Share sheet opened.");return;}
  catch(err){if(err.name==="AbortError")return;}
 }
 try{say(b,await copy(txt)?"Copied to clipboard.":"Copy unavailable. Select and copy the link manually.");}
 catch(_){say(b,"Copy unavailable. Select and copy the link manually.");}
});
const selector=$("[data-ref-select]"),field=$("[data-ref-input]"),output=$("[data-ref-output]");
const refresh=()=>{
 if(!selector||!field||!output)return;
 const code=field.value.trim().toLowerCase().replace(/^@/,"");
 const base=new URL(selector.value,location.origin);
 base.searchParams.set("utm_source","creator");
 base.searchParams.set("utm_medium","organic_social");
 if(code){if(!allowed(code)){output.value="Enter an approved 3–40 character referral code (letters, numbers, _ or -).";return;}base.searchParams.set("ref",code);}
 output.value=base.toString();
};
if(selector&&field&&output){selector.addEventListener("change",refresh);field.addEventListener("input",refresh);refresh();}
const copyBuilt=$("[data-copy-built]");
if(copyBuilt&&output)copyBuilt.addEventListener("click",async()=>{
 if(!output.value.startsWith("https://"))return;
 try{say(copyBuilt,await copy(output.value)?"Creator link copied.":"Copy unavailable.");}
 catch(_){say(copyBuilt,"Copy unavailable.");}
});
})();

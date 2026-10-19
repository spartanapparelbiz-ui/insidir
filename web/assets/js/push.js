/* Insidir: opt-in notifications with a branded first-party invitation.
 * The OS permission dialog is called only from a deliberate button tap, never page load.
 * iPhone/iPad Web Push requires Add to Home Screen then opening the installed site. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const icon="/assets/icons/favicon.svg";
const dismissedKey="insidir:push:prompt-dismissed";
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const supported=()=>window.isSecureContext&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
let status=null,registrationPromise=null,localSub=null,busy=false;
const page=location.pathname.split("/").at(-1)||"index.html";
function decodeKey(key){const b64=key.replace(/-/g,"+").replace(/_/g,"/"),raw=atob(b64.padEnd(Math.ceil(b64.length/4)*4,"=")),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
async function request(path,method="GET",payload){
 const r=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(payload?{"Content-Type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(typeof data.error==="string"?data.error:"Insidir could not update notifications.");
 return data;
}
function explain(){
 if(!status?.configured)return "Phone alerts aren't available yet. The sending keys need to be configured.";
 if(!supported())return "This browser doesn't support phone notifications. Try Chrome on Android or a Home Screen app on iPhone.";
 if(ios&&!standalone())return "On iPhone, tap Share → Add to Home Screen. Open Insidir from your Home Screen, then enable notifications here.";
 if(Notification.permission==="denied")return "Notifications were blocked in browser settings. Allow notifications for Insidir there, then return here.";
 if(localSub&&Notification.permission==="granted")return "Enabled on this device. New imported SEC Form 4 filings can trigger alerts for what you follow.";
 return "Allow notifications to receive new public SEC filings for people and companies you follow. No investment signals.";
}
function apply(){
 const p=$("ins-push-account");
 if(!p)return;
 const enabled=!!(status?.configured&&supported()&&(!ios||standalone()));
 $("ins-push-enable").hidden=!!localSub||!enabled;
 $("ins-push-disable").hidden=!localSub;
 $("ins-push-test").hidden=!localSub;
 $("ins-push-enable").disabled=busy||Notification.permission==="denied";
 $("ins-push-disable").disabled=busy;
 $("ins-push-test").disabled=busy;
 $("ins-push-people").checked=status?.preferences?.people!==false;
 $("ins-push-companies").checked=status?.preferences?.companies!==false;
 $("ins-push-people").disabled=busy||!status?.configured;
 $("ins-push-companies").disabled=busy||!status?.configured;
 $("ins-push-account-state").textContent=explain();
}
function message(text){const host=$("ins-push-account-state");if(host)host.textContent=text;const pane=$("ins-push-status");if(pane)pane.textContent=text}
function buildAccount(){
 const grid=document.querySelector(".v3-account__grid");
 if(!grid)return;
 const panel=document.createElement("section");
 panel.className="v3-account__panel ins-push-account";
 panel.id="ins-push-account";
 panel.innerHTML='<p class="v3-eyebrow">Notifications</p><h2>Phone alerts</h2>'+
  '<p id="ins-push-account-state" class="ins-push-status" role="status" aria-live="polite">Checking notification support…</p>'+
  '<div class="ins-push-preferences"><label class="ins-push-pref"><input id="ins-push-people" type="checkbox" checked> People you follow</label>'+
  '<label class="ins-push-pref"><input id="ins-push-companies" type="checkbox" checked> Companies on your watchlist</label></div>'+
  '<div class="ins-push-actions"><button type="button" id="ins-push-enable" class="ins-push-button">Enable notifications</button>'+
  '<button type="button" id="ins-push-disable" class="ins-push-link" hidden>Turn off on this device</button>'+
  '<button type="button" id="ins-push-test" class="ins-push-link" hidden>Send test notification</button></div>'+
  '<p class="ins-push-tag">Public SEC filings · after import · no trading advice</p>';
 grid.append(panel);
 $("ins-push-enable").addEventListener("click",enable);
 $("ins-push-disable").addEventListener("click",disable);
 $("ins-push-test").addEventListener("click",test);
 const preferences=()=>updatePrefs().catch(e=>message(e.message));
 $("ins-push-people").addEventListener("change",preferences);
 $("ins-push-companies").addEventListener("change",preferences);
}
function buildPrompt(){
 if($("ins-push-prompt"))return;
 const box=document.createElement("section");
 box.id="ins-push-prompt";
 box.className="ins-push-prompt";
 box.hidden=true;
 box.setAttribute("role","dialog");
 box.setAttribute("aria-label","Enable Insidir phone alerts");
 box.innerHTML='<div class="ins-push-top"><img class="ins-push-mark" src="'+icon+'" alt="" width="37" height="37">'+
 '<div><div class="ins-push-brand">INSIDIR</div><div class="ins-push-tag">Public filing intelligence</div></div>'+
 '<button type="button" id="ins-push-close" class="ins-push-close" aria-label="Dismiss notification invitation">×</button></div>'+
 '<h2>Stay close to the filings.</h2><p>Get a phone alert when a person you follow or a company you watch appears in a newly imported SEC Form 4.</p>'+
 '<div class="ins-push-actions"><button type="button" class="ins-push-button" id="ins-push-prompt-enable">Enable notifications</button>'+
 '<button type="button" class="ins-push-link" id="ins-push-later">Not now</button></div>'+
 '<p id="ins-push-status" class="ins-push-status" role="status" aria-live="polite"></p>';
 document.body.append(box);
 const later=()=>{box.hidden=true;try{localStorage.setItem(dismissedKey,String(Date.now()))}catch(_){/* private browsing */}};
 $("ins-push-close").addEventListener("click",later);
 $("ins-push-later").addEventListener("click",later);
 $("ins-push-prompt-enable").addEventListener("click",enable);
}
function hidePrompt(){const p=$("ins-push-prompt");if(p)p.hidden=true}
async function enable(){
 if(busy)return;
 if(!status?.configured||!supported()){message(explain());return}
 if(ios&&!standalone()){message(explain());return}
 if(Notification.permission==="denied"){message(explain());return}
 // The native prompt must be initiated synchronously by this click/tap.
 const permission=Notification.permission==="granted"?Promise.resolve("granted"):Notification.requestPermission();
 busy=true;apply();
 try{
  if((await permission)!=="granted"){message("Notifications weren't enabled. You can try again from Account.");return}
  const reg=await registrationPromise;
  if(!reg)throw Error("Insidir couldn't register browser notifications.");
  const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(status.publicKey)});
  await request("/v1/me/push/subscribe","POST",subscription.toJSON());
  localSub=subscription;
  hidePrompt();
  try{localStorage.setItem(dismissedKey,String(Date.now()))}catch(_){/* optional */}
  message("Notifications enabled on this device. You'll receive new public filing alerts for your follows.");
 }catch(e){message(e.message||"Couldn't enable notifications. Try again in Account.")}
 finally{busy=false;apply()}
}
async function disable(){
 if(!localSub||busy)return;busy=true;apply();
 try{
  await request("/v1/me/push/subscription","DELETE",{endpoint:localSub.endpoint});
  await localSub.unsubscribe();
  localSub=null;
  message("Notifications turned off on this device.");
 }catch(e){message(e.message)}
 finally{busy=false;apply()}
}
async function updatePrefs(){
 if(busy||!status?.configured)return;
 const people=$("ins-push-people").checked,companies=$("ins-push-companies").checked;
 busy=true;apply();
 try{const saved=await request("/v1/me/push/preferences","POST",{people,companies});status.preferences=saved.preferences;message("Notification preferences saved.");}
 catch(e){message(e.message)}finally{busy=false;apply()}
}
async function test(){
 if(busy||!localSub)return;busy=true;apply();
 try{const r=await request("/v1/me/push/test","POST",{});message("Test accepted by "+r.accepted+" push service"+(r.accepted===1?"":"s")+". Check your device's notifications.");}
 catch(e){message(e.message)}finally{busy=false;apply()}
}
function maybePrompt(){
 if(!(page==="dashboard.html"||page==="alerts.html"))return;
 if(!status?.configured||!supported()||(ios&&!standalone())||Notification.permission!=="default"||localSub)return;
 try{const time=Number(localStorage.getItem(dismissedKey)||0);if(Date.now()-time<30*86400e3)return}catch(_){/* no storage */}
 if($("ins-push-prompt"))$("ins-push-prompt").hidden=false;
}
async function init(){
 if(!supported()){if(page==="account.html"){buildAccount();message("This browser doesn't support Web Push.");}return}
 registrationPromise=navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>null);
 if(page==="account.html")buildAccount();
 if(page==="dashboard.html"||page==="alerts.html")buildPrompt();
 try{
   status=await request("/v1/me/push/status");
   const reg=await registrationPromise;
   localSub=reg?await reg.pushManager.getSubscription():null;
   apply();
   if(page==="dashboard.html"||page==="alerts.html")setTimeout(maybePrompt,1300);
 }catch(e){message("Sign in to manage Insidir notifications.");}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
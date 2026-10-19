/* Push permission is requested only when the user explicitly presses Enable. */
(()=>{"use strict";
 const box=document.querySelector("#insidir-push-setup");if(!box)return;
 const status=box.querySelector("[data-push-status]"),btn=box.querySelector("[data-push-enable]"),disable=box.querySelector("[data-push-disable]"),iosHelp=box.querySelector("[data-push-ios-help]"),androidHelp=box.querySelector("[data-push-android-help]"),installBtn=box.querySelector("[data-push-install]");
 const say=t=>{status.textContent=t;};
 const available=()=>("serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext);
 const base64=key=>{const s=(key+"=".repeat((4-key.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
 const request=async(path,method="GET",body)=>{const res=await fetch(path,{method,credentials:"same-origin",headers:{"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok)throw Error(data.error||"Request failed");return data;};
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||
   (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const android=/Android/i.test(navigator.userAgent);
 let installPrompt=null;
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;installBtn.hidden=false;});
 installBtn?.addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installBtn.hidden=true;});
 const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 const showIosInstall=()=>{
  btn.disabled=true;
  btn.textContent="Install Insidir first";
  iosHelp?.removeAttribute("hidden");
  say("On iPhone, notifications work from the Insidir Home Screen app. Install Insidir, open it from your Home Screen, then return here and tap Enable notifications.");
 };
 async function refresh(){
  // iPhone Safari intentionally does not expose normal-tab Web Push.
  // Check install state BEFORE generic capability detection so users receive the
  // actionable Home Screen instructions instead of a false "unsupported" error.
  if(ios&&!standalone){showIosInstall();return;}
  iosHelp?.setAttribute("hidden","");
  androidHelp?.setAttribute("hidden","");
  btn.textContent="Enable notifications";
  if(!available()){btn.disabled=true;if(android){androidHelp?.removeAttribute("hidden");say("For Android, open Insidir in Chrome, choose Install app or Add to Home screen, and enable notifications there.");}else say("This browser does not support Web Push. Try Safari, Chrome, Edge, or the installed Insidir app.");return;}
  btn.disabled=false;
  try{
   const state=await request("/v1/me/push");
   // No dead control: without server push keys there is nothing to enable, so the button goes and the reason stays.
   if(!state.configured){btn.hidden=true;disable.hidden=true;say("Push notifications are not available yet: the Insidir server has not been set up to send them. Alerts still appear here in the app.");return;}
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const sub=await registration.pushManager.getSubscription();
   btn.hidden=Boolean(sub);disable.hidden=!sub;
   say(sub?"Notifications enabled on this device. SEC alerts and occasional important Insidir product updates will be sent automatically.":"Notifications are off on this device. Enable SEC activity alerts and occasional Insidir product updates.");
  }catch(err){say("Could not load notification settings: "+err.message);}
 }
 btn?.addEventListener("click",async()=>{
  btn.disabled=true;say("Requesting permission…");
  try{
   if(ios&&!standalone){showIosInstall();return;}
   if(!available())throw Error("This browser does not support push.");
   const state=await request("/v1/me/push");
   if(!state.configured||!state.publicKey)throw Error("Server push configuration is not ready");
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const permission=await Notification.requestPermission();
   if(permission!=="granted")throw Error("Notifications are blocked. Allow them in your phone or browser settings, then try again.");
   const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64(state.publicKey)});
   try{await request("/v1/me/push","POST",sub.toJSON());}
   catch(e){await sub.unsubscribe();throw e;}
   say("Notifications enabled for followed companies and reporting people.");btn.hidden=true;disable.hidden=false;
  }catch(e){say("Could not enable notifications: "+e.message);}
  finally{btn.disabled=false;}
 });
 disable?.addEventListener("click",async()=>{
  disable.disabled=true;
  try{
   const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();
   if(sub){await request("/v1/me/push","DELETE",{endpoint:sub.endpoint});await sub.unsubscribe();}
   say("Notifications disabled on this device.");btn.hidden=false;disable.hidden=true;
  }catch(e){say("Could not disable notifications: "+e.message);}
  finally{disable.disabled=false;}
 });
 void refresh();
})();
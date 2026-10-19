/* Push permission is requested only when the user explicitly presses Enable. */
(()=>{"use strict";
 const box=document.querySelector("#insidir-push-setup");if(!box)return;
 const status=box.querySelector("[data-push-status]"),btn=box.querySelector("[data-push-enable]"),disable=box.querySelector("[data-push-disable]");
 const say=t=>{status.textContent=t;};
 const available=()=>("serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext);
 const base64=key=>{const s=(key+"=".repeat((4-key.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
 const request=async(path,method="GET",body)=>{const res=await fetch(path,{method,credentials:"same-origin",headers:{"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok)throw Error(data.error||"Request failed");return data;};
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
 const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 async function refresh(){
  if(!available()){btn.disabled=true;say("This browser does not support Web Push notifications.");return;}
  if(ios&&!standalone){btn.disabled=true;say("On iPhone: use Share → Add to Home Screen, open Insidir from the Home Screen, then enable notifications here.");return;}
  try{
   const state=await request("/v1/me/push");
   if(!state.configured){btn.disabled=true;say("Push delivery is not configured on the Insidir server yet.");return;}
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const sub=await registration.pushManager.getSubscription();
   btn.hidden=Boolean(sub);disable.hidden=!sub;
   say(sub?"Notifications enabled on this device. New matching SEC Form 4 filings will be sent automatically.":"Notifications are off on this device. Tap Enable to allow notifications.");
  }catch(err){say("Could not load notification settings: "+err.message);}
 }
 btn?.addEventListener("click",async()=>{
  btn.disabled=true;say("Requesting permission…");
  try{
   if(!available())throw Error("This browser does not support push.");
   const state=await request("/v1/me/push");
   if(!state.configured||!state.publicKey)throw Error("Server push configuration is not ready");
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const permission=await Notification.requestPermission();
   if(permission!=="granted")throw Error("Permission not granted. You can change this in your device settings.");
   const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64(state.publicKey)});
   try{await request("/v1/me/push","POST",sub.toJSON());}
   catch(e){await sub.unsubscribe();throw e;}
   say("Notifications enabled for followed companies and reporting people.");btn.hidden=true;disable.hidden=false;
  }catch(e){say("Push setup failed: "+e.message);}
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
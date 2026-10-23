/* /start: email → 6-digit code → the subscription terms → Stripe Checkout. No password (src/email-code.mjs).
   Already subscribed: straight to the dashboard. Inside Instagram, TikTok or Facebook's in-app browser a small hint
   explains how to open the page in the phone's own browser; nothing depends on it. */
(()=>{"use strict";
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const ua=navigator.userAgent||"";
const inApp=/Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|musical_ly|Bytedance|BytedanceWebview|Snapchat|Line\/|Twitter for/i.test(ua);
if(inApp){$("[data-st-iab]").hidden=false;
 if(/Android/i.test(ua)){$("[data-st-android]").hidden=false;$("[data-st-chrome]").href="intent://"+location.host+location.pathname+location.search+"#Intent;scheme=https;package=com.android.chrome;end";}}
let email="";
const step=name=>{for(const s of all("[data-st-step]"))s.hidden=s.dataset.stStep!==name;
 const order=["email","code","terms"],i=order.indexOf(name);for(const d of all("[data-st-dot]"))d.classList.toggle("is-on",order.indexOf(d.dataset.stDot)<=i);
 const f=$('[data-st-step="'+name+'"] input, [data-st-step="'+name+'"] button');if(f)setTimeout(()=>f.focus(),30);};
const say=(name,text,error)=>{const m=$('[data-st-step="'+name+'"] [data-st-msg]');if(!m)return;m.textContent=text||"";m.classList.toggle("is-error",!!error);};
const visitor=()=>{try{return localStorage.getItem("insidir:vid")||undefined}catch{return undefined}};
const capture=(name,props)=>{try{window.posthog?.capture?.(name,props||{})}catch{}};
async function api(path,{method="GET",body}={}){
 const res=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 let data=null;try{data=await res.json()}catch{}
 if(!res.ok)throw Object.assign(new Error(data?.error||"Something went wrong. Try again."),{status:res.status,data});
 return data;
}
const busy=(btn,on,label)=>{if(!btn)return;if(on){btn.dataset.label=btn.textContent;btn.textContent=label;btn.disabled=true;}else{btn.textContent=btn.dataset.label||btn.textContent;btn.disabled=false;}};

async function sendCode(){
 const btn=$("[data-st-email-form] button");say("email","");
 email=String($("#st-email").value||"").trim().toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){say("email","Enter a valid email address.",true);$("#st-email").focus();return;}
 busy(btn,true,"Sending…");
 try{await api("/v1/auth/email-code",{method:"POST",body:{email}});$("[data-st-addr]").textContent=email;step("code");capture("signup_code_sent");}
 catch(e){say("email",e.message,true);}
 finally{busy(btn,false);}
}
async function verify(){
 const btn=$("[data-st-code-form] button[type=submit]"),code=String($("#st-code").value||"").replace(/\D/g,"");say("code","");
 if(code.length!==6){say("code","Type the 6 digits from the email.",true);return;}
 busy(btn,true,"Checking…");
 try{const r=await api("/v1/auth/email-code/verify",{method:"POST",body:{email,code,visitor:visitor()}});
  capture(r.created?"signup_completed":"signin_completed");
  if(r.access?.active){location.href="/dashboard.html";return;}
  await terms();}
 catch(e){say("code",e.message,true);$("#st-code").select();}
 finally{busy(btn,false);}
}
let offer=null;
const usd=c=>"$"+(Number(c||0)/100).toFixed(2);
async function terms(){
 step("terms");
 try{const s=await api("/v1/billing/status");offer=s.offer;
  if(s.active){location.href="/dashboard.html";return;}
  if(!s.billingEnabled){say("terms","Checkout isn't open yet. Nothing was charged. Email hello@aethric.llc to get in.",true);return;}
  $("[data-st-disclosure]").textContent=offer.disclosure;
  $("[data-st-today]").textContent=usd(offer.todayCents);$("[data-st-then]").textContent=usd(offer.recurringCents);
  if(offer.kind!=="trial")$(".st-sum li").firstChild.textContent="Today, first month ";}
 catch(e){say("terms",e.message,true);}
}
async function pay(){
 const btn=$("[data-st-pay]");say("terms","");
 if(!offer||!$("[data-st-agree]").checked){say("terms","Tick the box to agree to the terms first.",true);return;}
 busy(btn,true,"Opening secure checkout…");
 try{const r=await api("/v1/billing/checkout",{method:"POST",body:{consent:true,offer:offer.kind,disclosureVersion:offer.disclosureVersion}});
  capture("checkout_started");
  if(typeof r.url==="string"&&r.url.startsWith("https://"))location.href=r.url;else throw new Error("Checkout couldn't start, and nothing was charged. Try again.");}
 catch(e){if(e.data?.offer){offer=e.data.offer;$("[data-st-disclosure]").textContent=offer.disclosure;$("[data-st-agree]").checked=false;}say("terms",e.message,true);busy(btn,false);$("[data-st-pay]").disabled=!$("[data-st-agree]").checked;}
}
$("[data-st-email-form]").addEventListener("submit",e=>{e.preventDefault();void sendCode();});
$("[data-st-code-form]").addEventListener("submit",e=>{e.preventDefault();void verify();});
$("#st-code").addEventListener("input",e=>{const v=e.target.value.replace(/\D/g,"").slice(0,6);e.target.value=v;if(v.length===6)void verify();});
$("[data-st-resend]").addEventListener("click",()=>{$("#st-code").value="";step("email");$("#st-email").value=email;void sendCode();});
$("[data-st-back]").addEventListener("click",()=>{$("#st-code").value="";step("email");});
$("[data-st-agree]").addEventListener("change",e=>{$("[data-st-pay]").disabled=!e.target.checked;});
$("[data-st-pay]").addEventListener("click",()=>void pay());

// Remember the stock they searched (the first screen after paying offers it), and skip ahead if already signed in.
try{const t=new URLSearchParams(location.search).get("t");if(t&&/^[A-Z][A-Z0-9.-]{0,9}$/i.test(t))localStorage.setItem("insidir:first-ticker",t.toUpperCase());}catch{}
fetch("/v1/me",{credentials:"same-origin"}).then(r=>r.ok?r.json():null).then(me=>{
 if(!me?.user)return;
 if(me.access?.active){location.replace("/dashboard.html");return;}
 email=me.user.email||"";void terms();
}).catch(()=>{});
})();

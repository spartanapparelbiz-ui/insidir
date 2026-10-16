/* Account (account.html): who is logged in, the subscription in one line with the one action that
   fixes or manages it, sign out, and account deletion. DELETE /v1/me cancels any Stripe subscription
   before removing the account; when that cancellation fails the account is kept and the server's
   reason is shown here as an error. After a deletion the browser goes to account-deleted.html, which
   explains what was removed. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const HINT="insidir:signed-in";
const forget=()=>{try{localStorage.removeItem(HINT)}catch(_){/* storage unavailable */}};
async function req(path,method="GET",payload){
 const r=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(payload?{"Content-Type":"application/json"}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})});
 let data;try{data=await r.json()}catch{throw Object.assign(Error(""),{status:r.status})}
 if(!r.ok){const e=Error(typeof data?.error==="string"?data.error:"");e.status=r.status;throw e;}return data;
}
const dateText=iso=>{const d=new Date(iso);return iso&&!isNaN(d)?d.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}):""};
/* A live Stripe subscription that needs attention is fixed in Billing (Stripe's portal), never with a new checkout. */
const FIX={past_due:["Payment past due · access paused","Update payment"],unpaid:["Unpaid invoice · access paused","Update payment"],
 incomplete:["First payment pending · access paused","Finish payment"],paused:["Paused · access paused","Resume subscription"]};
function plan(access){
 if(!access)return "Subscription status unavailable";
 if(access.complimentary&&access.active)return "Complimentary access";
 if(access.active){const end=dateText(access.currentPeriodEnd);return "Active"+(end?" · current period ends "+end:"");}
 if(FIX[access.status])return FIX[access.status][0];
 if(access.billingEnabled===false)return "Not subscribed · checkout isn't open yet";
 return access.status==="canceled"?"Cancelled · not subscribed":"Not subscribed";
}
/* The panel's solid button is the one thing to do next; Billing stays one quiet link away, in the note
   (one button per panel keeps the panels' action rows on one line at every width). */
function actions(access){
 const primary=$("account-primary"),note=$("account-plan-note");
 const set=(el,label,href)=>{el.textContent=label+" →";el.setAttribute("href",href);};
 if(!access||access.active||access.billingEnabled===false){set(primary,"Open billing","billing.html");return;}
 if(FIX[access.status]){
  set(primary,FIX[access.status][1],"billing.html");
  note.textContent="Your subscription still exists in Stripe but needs attention. Fix it from Billing; there's no need to subscribe again.";
  return;
 }
 set(primary,"Subscribe · $39/month","subscribe.html");
 const billing=document.createElement("a");billing.href="billing.html";billing.textContent="Billing";
 note.replaceChildren("Insidir is a paid research workspace. Subscribe to open the dashboard, research desk and company reports"+(access.status?"; everything you saved is still here. ":". ")+"Past invoices and payment details are in ",billing,".");
}
function deleteFailed(text){
 const out=$("account-delete-feedback");
 out.classList.add("is-error");
 out.textContent=text;
}
document.addEventListener("DOMContentLoaded",async()=>{
 try{const r=await req("/v1/me");
   $("account-email").textContent=r.user?.email||"Not available";
   $("account-status").textContent="Your session uses a secure, first-party cookie and lasts up to 14 days.";
   $("account-plan").textContent=plan(r.access);
   actions(r.access);
   $("account-delete").disabled=false;
 }catch(e){
   $("account-email").textContent=e.status===401?"Not logged in":"Unavailable";
   $("account-status").textContent=e.status===401?"Log in to manage your account.":"We couldn't reach the account service. Reload the page in a moment.";
   $("account-plan").textContent="—";
   if(e.status===401){forget();$("account-signin").hidden=false;$("account-signout").hidden=true;}
 }
 $("account-signout").addEventListener("click",async()=>{try{await req("/v1/auth/logout","POST");forget();location.assign("signin.html");}catch(e){$("account-status").textContent=e.message||"We couldn't sign you out just now. Please try again.";}});
 const form=$("account-delete-form"),pw=$("account-delete-password"),out=$("account-delete-feedback");
 $("account-delete").addEventListener("click",()=>{
  out.classList.remove("is-error");out.textContent="";
  $("account-delete-email").textContent=$("account-email").textContent||"this account";
  form.hidden=false;$("account-delete").hidden=true;pw.value="";pw.focus();
 });
 $("account-delete-cancel").addEventListener("click",()=>{
  form.hidden=true;$("account-delete").hidden=false;pw.value="";out.classList.remove("is-error");out.textContent="Nothing was changed.";$("account-delete").focus();
 });
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();
  out.classList.remove("is-error");
  if(!pw.value){deleteFailed("Enter your password to delete the account.");pw.focus();return;}
  const button=$("account-delete-confirm");button.disabled=true;
  out.textContent="Cancelling any subscription and deleting your account…";
  try{await req("/v1/me","DELETE",{password:pw.value});pw.value="";forget();location.assign("account-deleted.html");}
  catch(e){
   // The engine explains what happened (a wrong password, or Stripe couldn't confirm the cancellation); show it as is.
   const server=e instanceof TypeError?"":String(e.message||"").trim();
   deleteFailed(e instanceof TypeError?"We couldn't reach Insidir, so your account was not deleted. Check your connection and try again."
    :e.status===401?"Your session has ended, so nothing was deleted. Log in again to delete your account."
    :server?server.replace(/([^.!?])$/,"$1."):"Your account was not deleted and nothing was changed. Please try again, or email hello@aethric.llc.");
   button.disabled=false;pw.select();
  }
 });
});
})();

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
let currentBilling = null;
const CANCELLABLE = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
function renderCancellation(billing) {
 currentBilling = billing;
 const cancel = $("account-cancel"), confirmation = $("account-cancel-confirm");
 const status = String(billing?.subscriptionStatus || "").toLowerCase();
 const pending = billing?.cancelAtPeriodEnd === true;
 cancel.hidden = !billing?.hasCustomer || !CANCELLABLE.has(status) || pending;
 cancel.setAttribute("aria-expanded", "false");
 confirmation.hidden = true;
 if (pending) {
  const until = dateText(billing.currentPeriodEnd);
  $("account-plan").textContent = "Cancellation scheduled" + (until ? " · access until " + until : "");
  $("account-plan-note").textContent = "Automatic renewal is off. No further monthly renewal charges are scheduled."
   + (until ? " Your current access continues until " + until + "." : "");
 }
}
function plan(access){
 if(!access)return "Subscription status unavailable";
 if(access.complimentary&&access.active)return "Complimentary access";
 if(access.active&&access.status==="trialing"){const end=dateText(access.currentPeriodEnd);return "Trial"+(end?" · ends "+end:"")+" · then $39/month unless cancelled";}
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
/* 05 / Email: the address everything is sent to. */
function verified(me){$("account-verified").textContent=me?.user?.email||"";}
const KIND={register:"Account created",login_success:"Signed in",logout:"Signed out",login_failure:"Failed sign-in",password_changed:"Password changed",password_reset_requested:"Password reset requested",
 password_reset_completed:"Password reset",email_verified:"Email confirmed",email_verification_sent:"Confirmation link sent",sessions_revoked:"Other devices signed out",data_exported:"Data downloaded",
 password_change_failed:"Password change refused",account_delete_failed:"Deletion refused (wrong password)"};
/* 06 / Security and 07 / Your data. */
function security(){
 const out=$("account-security-feedback");
 const say=(t,bad)=>{out.classList.toggle("is-error",!!bad);out.textContent=t;};
 const list=$("account-events");
 const load=()=>req("/v1/me/security-events").then(r=>{
  list.replaceChildren(...(r.items||[]).slice(0,10).map(e=>{const li=document.createElement("li");const when=new Date(e.created_at);
   li.textContent=(KIND[e.kind]||e.kind)+" · "+(isNaN(when)?"":when.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}));return li;}));
  if(!list.children.length)list.replaceChildren(Object.assign(document.createElement("li"),{textContent:"Nothing recorded yet."}));
 }).catch(()=>{list.replaceChildren(Object.assign(document.createElement("li"),{textContent:"Activity is unavailable right now."}))});
 load();
 $("account-password-form").addEventListener("submit",async ev=>{
  ev.preventDefault();
  const cur=$("account-password-current"),next=$("account-password-new");
  if(!cur.value){say("Enter your current password.",true);return cur.focus();}
  if(next.value.length<12||next.value.length>128){say("Use 12 to 128 characters for the new password.",true);return next.focus();}
  $("account-password-save").disabled=true;
  try{const r=await req("/v1/me/password","POST",{currentPassword:cur.value,newPassword:next.value});cur.value=next.value="";
   say("Password changed."+(r.otherSessionsRevoked?" "+r.otherSessionsRevoked+" other session"+(r.otherSessionsRevoked>1?"s were":" was")+" signed out.":""));load();}
  catch(e){say(e.message?e.message.replace(/([^.!?])$/,"$1."):"Your password was not changed. Try again.",true);}
  $("account-password-save").disabled=false;
 });
 $("account-sessions-revoke").addEventListener("click",async()=>{
  try{const r=await req("/v1/me/sessions/revoke-others","POST",{});say(r.revoked?r.revoked+" other session"+(r.revoked>1?"s were":" was")+" signed out.":"No other sessions were signed in.");load();}
  catch(e){say(e.message||"That didn't work. Try again.",true);}
 });
 $("account-export").addEventListener("click",async()=>{
  const fb=$("account-export-feedback");fb.classList.remove("is-error");fb.textContent="Preparing your file…";
  try{const data=await req("/v1/me/export");const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
   const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="insidir-account-export.json";document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(a.href),5000);fb.textContent="Downloaded insidir-account-export.json.";load();}
  catch(e){fb.classList.add("is-error");fb.textContent=e.message||"The download failed. Try again.";}
 });
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
   verified(r);
   security();
   // Never show a cancellation button until the server has checked this account's Stripe status.
   try {
    renderCancellation(await req("/v1/billing/status?refresh=1"));
   } catch (_) {
    $("account-cancel-feedback").textContent = "We couldn't verify renewal status here. You can still cancel from Billing.";
   }
 }catch(e){
   $("account-email").textContent=e.status===401?"Not logged in":"Unavailable";
   $("account-status").textContent=e.status===401?"Log in to manage your account.":"We couldn't reach the account service. Reload the page in a moment.";
   $("account-plan").textContent="—";
   if(e.status===401){forget();$("account-signin").hidden=false;$("account-signout").hidden=true;}
 }
 $("account-signout").addEventListener("click",async()=>{try{await req("/v1/auth/logout","POST");forget();location.assign("signin.html");}catch(e){$("account-status").textContent=e.message||"We couldn't sign you out just now. Please try again.";}});
 const cancel=$("account-cancel"), cancelBox=$("account-cancel-confirm"), feedback=$("account-cancel-feedback");
 cancel.addEventListener("click",()=>{
  const end = dateText(currentBilling?.currentPeriodEnd);
  const trial = currentBilling?.subscriptionStatus === "trialing";
  $("account-cancel-copy").textContent = trial
   ? "The $39 monthly charge will not start. Your $1 trial access continues" + (end ? " until " + end : " until the end of the trial") + "."
   : "You will not be charged at the next monthly renewal. Your current access continues" + (end ? " until " + end : " until the current period ends") + ".";
  feedback.textContent = "";
  feedback.classList.remove("is-error");
  cancelBox.hidden = false;
  cancel.setAttribute("aria-expanded", "true");
  $("account-cancel-yes").focus();
 });
 $("account-cancel-keep").addEventListener("click",()=>{
  cancelBox.hidden=true;cancel.setAttribute("aria-expanded","false");
  feedback.classList.remove("is-error");
  feedback.textContent="Nothing was changed.";
  cancel.focus();
 });
 $("account-cancel-yes").addEventListener("click",async()=>{
  const yes=$("account-cancel-yes"),keep=$("account-cancel-keep");
  yes.disabled=true;keep.disabled=true;cancel.disabled=true;
  feedback.textContent="Confirming cancellation with Stripe…";
  feedback.classList.remove("is-error");
  try {
   const result=await req("/v1/billing/cancel","POST",{});
   cancelBox.hidden=true;cancel.setAttribute("aria-expanded","false");cancel.hidden=true;
   if(result.canceled){
    const until=dateText(result.accessUntil || currentBilling?.currentPeriodEnd);
    renderCancellation({...currentBilling,cancelAtPeriodEnd:true});
    feedback.textContent="Subscription cancellation confirmed. No further renewal charges."+(until?" Your access continues until "+until+".":"");
   } else if(result.alreadyCanceled){
    $("account-plan").textContent="Cancelled · not subscribed";
    $("account-plan-note").textContent="Your subscription is already cancelled. No further renewal charges are scheduled.";
    feedback.textContent="Your subscription was already cancelled.";
   } else {
    // Do not report a confirmed cancellation if the server did not explicitly confirm it.
    throw Error("Stripe did not confirm cancellation. Please check Billing or contact hello@aethric.llc.");
   }
   $("account-primary").focus();
  }catch(e){
   const reason=e instanceof TypeError?"We couldn't reach Insidir, so cancellation was not confirmed. Check your connection and try again."
    :e.status===401?"Your session ended. Log in again to cancel your subscription."
    :e.message||"Cancellation could not be confirmed. Please try again or contact hello@aethric.llc.";
   feedback.classList.add("is-error");feedback.textContent=reason;
   cancel.hidden=false;cancelBox.hidden=false;cancel.setAttribute("aria-expanded","true");
  }finally{yes.disabled=false;keep.disabled=false;cancel.disabled=false;}
 });
 const form=$("account-delete-form"),pw=$("account-delete-password"),out=$("account-delete-feedback");
 $("account-delete").addEventListener("click",()=>{
  out.classList.remove("is-error");out.textContent="";
  $("account-delete-email").textContent=$("account-email").textContent||"this account";
  form.hidden=false;$("account-delete").hidden=true;pw.value="";pw.focus();
 });
 // Accounts that sign in by email code have no password: a fresh code confirms the deletion instead.
 $("account-delete-code")?.addEventListener("click",async()=>{
  out.classList.remove("is-error");
  try{await req("/v1/auth/email-code","POST",{email:$("account-email").textContent.trim()});out.textContent="We emailed you a 6-digit code. Type it in the box below.";pw.type="text";pw.setAttribute("inputmode","numeric");pw.focus();}
  catch(e){deleteFailed(String(e.message||"We couldn't send a code. Try again."));}
 });
 $("account-delete-cancel").addEventListener("click",()=>{
  form.hidden=true;$("account-delete").hidden=false;pw.value="";out.classList.remove("is-error");out.textContent="Nothing was changed.";$("account-delete").focus();
 });
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();
  out.classList.remove("is-error");
  if(!pw.value){deleteFailed("Enter your password, or the code we emailed you, to delete the account.");pw.focus();return;}
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

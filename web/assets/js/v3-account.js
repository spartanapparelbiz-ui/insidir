(() => {"use strict";
const $=id=>document.getElementById(id);
async function req(path,method="GET"){
 const r=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json"}});
 let data;try{data=await r.json()}catch{throw Error("Account service unavailable")};
 if(!r.ok){let e=Error(data.error||"Request failed");e.status=r.status;throw e;}return data;
}
document.addEventListener("DOMContentLoaded",async()=>{
 try{const r=await req("/v1/me");
   $("account-email").textContent=r.user?.email||"Not available";
   $("account-status").textContent="Signed in. Session access is managed through a secure first-party cookie.";
   $("account-delete").disabled=false;
 }catch(e){$("account-email").textContent="Not signed in";$("account-status").textContent="Sign in to manage your account."; $("account-signin").hidden=false;$("account-signout").hidden=true;}
 $("account-signout").addEventListener("click",async()=>{try{await req("/v1/auth/logout","POST");location.assign("signin.html");}catch(e){$("account-status").textContent=e.message;}});
 $("account-delete").addEventListener("click",async()=>{
  if(!confirm("Permanently delete your Insidir account and your saved research? This cannot be undone."))return;
  const answer=prompt('To confirm, type DELETE in all capital letters:');
  if(answer!=="DELETE"){$("account-delete-feedback").textContent="Account deletion cancelled.";return;}
  const button=$("account-delete");button.disabled=true;
  $("account-delete-feedback").textContent="Deleting your account and saved research…";
  try{await req("/v1/me","DELETE");location.assign("index.html");}
  catch(e){$("account-delete-feedback").textContent="Could not complete deletion: "+e.message+". If brokerage access exists, revoke it first through your connected provider.";button.disabled=false;}
 });
});
})();
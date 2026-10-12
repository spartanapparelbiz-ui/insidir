import {createHmac,timingSafeEqual} from "node:crypto";
import {query} from "./db.mjs";
import {currentUser} from "./auth.mjs";
const secret=()=>process.env.INSIDIR_STRIPE_SECRET_KEY||"";
const price=()=>process.env.INSIDIR_STRIPE_PRICE_ID||"";
const hook=()=>process.env.INSIDIR_STRIPE_WEBHOOK_SECRET||"";
const enabled=()=>process.env.INSIDIR_BILLING_ENABLED==="1"&&!!secret()&&!!price()&&!!hook();
const forbidden=(status,msg)=>Object.assign(new Error(msg),{status});
const safeHost=req=>{const host=process.env.INSIDIR_PUBLIC_URL;if(!host)throw forbidden(503,"Public website URL is not configured");const u=new URL(host);if(u.protocol!=="https:")throw forbidden(503,"HTTPS required");return u.origin};
const sameOrigin=req=>{const o=req.headers.origin;return !!o&&o===safeHost(req)};
function parseStripeSig(raw,signature){
 const map=Object.fromEntries(String(signature||"").split(",").map(x=>x.split("=")));
 const ts=Number(map.t);if(!Number.isSafeInteger(ts)||Math.abs(Date.now()/1000-ts)>300||!/^[a-f0-9]{64}$/.test(map.v1||""))return false;
 const check=createHmac("sha256",hook()).update(String(ts)+"."+raw).digest("hex");
 return timingSafeEqual(Buffer.from(check),Buffer.from(map.v1));
}
async function stripe(path,params){
 if(!secret())throw forbidden(503,"Stripe not connected for Insidir");
 const r=await fetch("https://api.stripe.com/v1"+path,{method:"POST",headers:{"Authorization":"Bearer "+secret(),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(12000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw forbidden(r.status>=500?503:400,d.error?.message||"Stripe request failed");return d;
}
async function read(req,limit=65536){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>limit)throw forbidden(413,"Payload too large");chunks.push(c)}return Buffer.concat(chunks)}
async function getUser(req){const u=await currentUser(req);if(!u)throw forbidden(401,"Sign in required");return u}
export async function billingRoutes(req,res,p,json){
 if(p==="/v1/billing/status"&&req.method==="GET"){
 const u=await getUser(req);const r=await query("SELECT stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end FROM users WHERE id=$1",[u.id]);
 const d=r.rows[0];return json(res,200,{billingEnabled:enabled(),plan: ["active","trialing"].includes(d.subscription_status)?"pro":"free",subscriptionStatus:d.subscription_status||null,currentPeriodEnd:d.current_period_end||null});
 }
 if(p==="/v1/billing/checkout"&&req.method==="POST"){
 if(!enabled())throw forbidden(503,"Insidir checkout is not yet enabled");
 if(!sameOrigin(req))throw forbidden(403,"Untrusted origin");
 const u=await getUser(req);const d=(await query("SELECT stripe_customer_id,subscription_status FROM users WHERE id=$1",[u.id])).rows[0];
 if(["active","trialing"].includes(d.subscription_status))throw forbidden(409,"You already have Pro; manage your subscription instead");
 let customer=d.stripe_customer_id;
 if(!customer){const c=await stripe("/customers",{email:u.email,"metadata[insidir_user_id]":u.id});customer=c.id;await query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2",[customer,u.id])}
 const site=safeHost(req);
 const session=await stripe("/checkout/sessions",{"mode":"subscription","customer":customer,"line_items[0][price]":price(),"line_items[0][quantity]":"1","client_reference_id":u.id,"success_url":site+"/billing.html?checkout=success","cancel_url":site+"/pricing.html?checkout=cancel","subscription_data[metadata][insidir_user_id]":u.id,"metadata[insidir_user_id]":u.id});
 return json(res,200,{url:session.url});
 }
 if(p==="/v1/billing/portal"&&req.method==="POST"){
 if(!enabled())throw forbidden(503,"Insidir billing portal is not configured");
 if(!sameOrigin(req))throw forbidden(403,"Untrusted origin");
 const u=await getUser(req);
 const d=(await query("SELECT stripe_customer_id FROM users WHERE id=$1",[u.id])).rows[0];if(!d?.stripe_customer_id)throw forbidden(404,"No subscription customer found");
 const x=await stripe("/billing_portal/sessions",{customer:d.stripe_customer_id,return_url:safeHost(req)+"/billing.html"});
 return json(res,200,{url:x.url});
 }
 if(p==="/v1/billing/webhook"&&req.method==="POST"){
 if(!hook())throw forbidden(503,"Insidir Stripe webhook is not configured");
 const raw=await read(req);if(!parseStripeSig(raw,req.headers["stripe-signature"]))throw forbidden(400,"Invalid webhook signature");
 let event;try{event=JSON.parse(raw)}catch{throw forbidden(400,"Invalid webhook payload")}
 const supported=["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"];
 if(!supported.includes(event.type))return json(res,200,{received:true});
 const client=await query("INSERT INTO stripe_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",[event.id]);
 if(!client.rows.length)return json(res,200,{received:true,duplicate:true});
 const obj=event.data?.object||{};
 try{
 if(event.type==="checkout.session.completed"&&obj.mode==="subscription"&&obj.customer){
 await query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2 AND (stripe_customer_id IS NULL OR stripe_customer_id=$1)",[obj.customer,obj.client_reference_id]);
 }
 if(event.type.startsWith("customer.subscription.")){
 const customer=obj.customer,sub=obj.id,status=obj.status;
 // Only grant entitlements for our exact configured Price ID.
 const hasPrice=(obj.items?.data||[]).some(x=>x.price?.id===price());
 const nextStatus=hasPrice?status:"inactive";
 if(customer&&sub)await query("UPDATE users SET stripe_subscription_id=$1,subscription_status=$2,current_period_end=to_timestamp($3) WHERE stripe_customer_id=$4",[sub,nextStatus,Number(obj.current_period_end)||0,customer]);
 }
 }catch(e){await query("DELETE FROM stripe_events WHERE event_id=$1",[event.id]);throw e}
 return json(res,200,{received:true});
 }
 return false;
}

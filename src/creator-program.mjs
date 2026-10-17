/* One-time $10 Insidir creator referrals. No automatic payouts.
 * The commission is earned on the referred account's first $39 payment: the plan's first invoice, or after
 * the $1 trial (whose invoice is below $39) the first renewal. creator_commissions.referred_user_id is unique,
 * so every later renewal is ignored.
 * Only approved partners have active links. No paid customer access is granted here.
 * Commission candidates require verified initial Stripe invoices and a 30-day review hold. */
import { timingSafeEqual } from "node:crypto";

export const REF_CODE = /^[a-z0-9][a-z0-9_-]{2,39}$/;
const HANDLE = /^[a-z0-9_.]{1,30}$/;
const EMAIL = /^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/;
const fail = (status,message) => { const e=new Error(message);e.status=status;return e; };
export function normalizeReferralCode(value) {
  if(typeof value!=="string")return null;
  const code=value.trim().toLowerCase();
  return REF_CODE.test(code)?code:null;
}
export function normalizeHandle(value) {
  if(typeof value!=="string")return null;
  const handle=value.trim().replace(/^@/,"").toLowerCase();
  return HANDLE.test(handle)?handle:null;
}
export function commissionEligibleInvoice(invoice) {
  return !!invoice && invoice.status==="paid" &&
    (invoice.billing_reason==="subscription_create"||invoice.billing_reason==="subscription_cycle") && invoice.currency==="usd" &&
    Number.isSafeInteger(invoice.amount_paid) && invoice.amount_paid>=3900 &&
    /^cus_[A-Za-z0-9]+$/.test(String(invoice.customer||"")) &&
    /^in_[A-Za-z0-9]+$/.test(String(invoice.id||""));
}
/* Caller must verify the Stripe customer's subscription is active AND contains
 * the configured Insidir price. This is a candidate for manual payout review,
 * not an instruction to transfer money. Unique user and invoice constraints prevent
 * second commissions for retries or future renewals. */
export async function recordFirstPaidInvoice(invoice,{query,verifiedPlan}) {
  if(!commissionEligibleInvoice(invoice)||!verifiedPlan)return false;
  const res=await query(
    `INSERT INTO creator_commissions(creator_id,referred_user_id,stripe_invoice_id,stripe_customer_id)
     SELECT r.creator_id,u.id,$2,u.stripe_customer_id
     FROM users u JOIN creator_referrals r ON r.user_id=u.id
     JOIN creator_partners p ON p.id=r.creator_id
     WHERE u.stripe_customer_id=$1 AND p.status='approved'
       AND (p.contact_email IS NULL OR lower(p.contact_email)<>lower(u.email))
     ON CONFLICT DO NOTHING RETURNING id`,
    [invoice.customer,invoice.id]);
  return !!res.rows.length;
}
const authorized=(req,env)=>{
  const configured=String(env.INSIDIR_CREATOR_ADMIN_TOKEN||"");
  const supplied=String(req.headers.authorization||"").replace(/^Bearer /i,"");
  if(configured.length<32||supplied.length!==configured.length)return false;
  return timingSafeEqual(Buffer.from(configured),Buffer.from(supplied));
};
async function readJson(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>4096)throw fail(413,"Request too large");chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw fail(400,"Invalid JSON");}
}
export async function creatorAdminRoutes(req,res,path,json,{query,env=process.env}) {
  if(!path.startsWith("/v1/creators/admin/"))return false;
  if(!authorized(req,env))throw fail(401,"Unauthorized");
  res.setHeader("Cache-Control","no-store");
  if(path==="/v1/creators/admin/partners" && req.method==="GET"){
    const rows=await query("SELECT code,instagram_handle,display_name,contact_email,status,created_at FROM creator_partners ORDER BY created_at DESC LIMIT 300");
    return json(res,200,{partners:rows.rows});
  }
  if(path==="/v1/creators/admin/partners" && req.method==="POST"){
    const data=await readJson(req);
    const handle=normalizeHandle(data?.instagramHandle);
    const code=normalizeReferralCode(data?.code || (handle&&handle.replace(/\./g,"-")));
    const name=typeof data?.name==="string"?data.name.trim().slice(0,120):"";
    const email=typeof data?.email==="string"&&data.email.trim()?data.email.trim().toLowerCase():null;
    if(!handle||!code||!name||email&&!EMAIL.test(email))throw fail(400,"Invalid creator details");
    // Activation requires a genuine agreement with the creator.
    const status=data?.approved===true?"approved":"pending";
    const result=await query(
      "INSERT INTO creator_partners(code,instagram_handle,display_name,contact_email,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING code,status",
      [code,handle,name,email,status]);
    if(!result.rows.length)throw fail(409,"Creator handle or code already exists");
    return json(res,201,{...result.rows[0],referralUrl:"https://insidir.com/signup.html?ref="+code});
  }
  if(path==="/v1/creators/admin/commissions" && req.method==="GET"){
    const rows=await query(
      `SELECT c.id,p.instagram_handle,p.display_name,c.amount_cents,c.status,
        c.stripe_invoice_id,c.stripe_customer_id,c.earned_at,c.eligible_at
       FROM creator_commissions c JOIN creator_partners p ON p.id=c.creator_id
       ORDER BY c.earned_at DESC LIMIT 500`);
    return json(res,200,{commissions:rows.rows,note:"Manual approval only. Verify payment, refunds and disputes in Stripe before any payout; the eligible date does not authorize payment."});
  }
  throw fail(404,"Unknown creator admin route");
}

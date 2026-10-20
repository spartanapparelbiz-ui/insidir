import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { normalizeReferralCode, normalizeHandle, commissionEligibleInvoice, recordFirstPaidInvoice, creatorAdminRoutes } from "../src/creator-program.mjs";
import { generateTotpSecret, totpCode, base32Decode, stepAt } from "../src/totp.mjs";

const valid={id:"in_test123",customer:"cus_test123",status:"paid",currency:"usd",amount_paid:3900,billing_reason:"subscription_create"};
test("referral codes are strictly bounded and normalized",()=>{
  assert.equal(normalizeReferralCode(" Test-Creator "),"test-creator");
  for(const code of [null,"","a","x".repeat(50),"hello.world","bad/case","éxample","x y"])
    assert.equal(normalizeReferralCode(code),null);
  assert.equal(normalizeHandle("@Creator.Name"),"creator.name");
  assert.equal(normalizeHandle("bad/name"),null);
});
test("only a genuinely paid $39 subscription invoice qualifies, never the $1 trial invoice",()=>{
  assert.equal(commissionEligibleInvoice(valid),true);
  // After the $1 trial the first $39 payment is the first renewal; later renewals hit the unique referred_user_id.
  assert.equal(commissionEligibleInvoice({...valid,billing_reason:"subscription_cycle"}),true);
  for(const change of [{status:"open"},{amount_paid:0},{amount_paid:100},{amount_paid:3899},{currency:"eur"},{billing_reason:"manual"},{billing_reason:"subscription_update"},{id:"oops"},{customer:"oops"}])
    assert.equal(commissionEligibleInvoice({...valid,...change}),false);
});
test("commission insert requires a separately verified plan and never automatically pays",async()=>{
  let seen=0;
  const query=async(sql,params)=>{seen++;assert.match(sql,/ON CONFLICT DO NOTHING/);assert.match(sql,/status='approved'/);assert.deepEqual(params,["cus_test123","in_test123"]);return {rows:[{id:1}]};};
  assert.equal(await recordFirstPaidInvoice(valid,{query,verifiedPlan:false}),false);
  assert.equal(seen,0);
  assert.equal(await recordFirstPaidInvoice({...valid,amount_paid:0},{query,verifiedPlan:true}),false);
  assert.equal(seen,0);
  assert.equal(await recordFirstPaidInvoice(valid,{query,verifiedPlan:true}),true);
  assert.equal(seen,1);
});
test("admin endpoint fails closed when token missing",async()=>{
  await assert.rejects(()=>creatorAdminRoutes({headers:{authorization:"Bearer fake"},method:"GET"},{},
    "/v1/creators/admin/commissions",()=>{},{env:{},query:async()=>({rows:[]})}),e=>e.status===503);
});

// Admin requests carry the token and a fresh one-time code (src/admin-auth.mjs); the audit and one-time-code
// bookkeeping queries are answered here, so each test sees only its own creator queries.
const token="t".repeat(40), secret=generateTotpSecret();
const adminEnv={INSIDIR_CREATOR_ADMIN_TOKEN:token,INSIDIR_ADMIN_TOTP_SECRET:secret};
const adminReq=(path,body)=> {
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  req.method=body===undefined?"GET":"POST";
  req.url=path;
  req.headers={authorization:"Bearer "+token,"x-insidir-admin-otp":totpCode(base32Decode(secret),stepAt())};
  req.socket={};
  return req;
};
const adminQuery=handler=>{
  const used=new Set();
  return async(sql,params)=>{
    if(sql.startsWith("INSERT INTO admin_audit_log"))return {rows:[]};
    if(sql.startsWith("INSERT INTO admin_otp_used")){if(used.has(params[1]))return {rows:[]};used.add(params[1]);return {rows:[{step:params[1]}]};}
    return handler(sql,params);
  };
};
const response=(res,status,body)=>({status,body});
test("approve requires an explicit confirmed partnership agreement",async()=>{
  let calls=0;
  const path="/v1/creators/admin/partners/approve";
  await assert.rejects(
    ()=>creatorAdminRoutes(adminReq(path,{code:"stock-creator"}),{setHeader(){}},path,response,{env:adminEnv,query:adminQuery(async()=>{calls++;return {rows:[{code:"stock-creator",status:"approved"}]};})}),
    e=>e.status===400);
  assert.equal(calls,0);
  const result=await creatorAdminRoutes(adminReq(path,{code:"stock-creator",confirmedAgreement:true}),{setHeader(){}},path,response,{
    env:adminEnv,
    query:adminQuery(async(sql,params)=>{
      assert.match(sql,/status IN \('pending','approved'\)/);
      assert.deepEqual(params,["stock-creator"]);
      calls++;
      return {rows:[{code:"stock-creator",status:"approved"}]};
    })});
  assert.equal(result.status,200);
  assert.equal(result.body.referralUrl,"https://insidir.com/signup.html?ref=stock-creator");
  assert.equal(calls,1);
});
test("metrics separates tracked registrations from first paid invoices",async()=>{
  const path="/v1/creators/admin/metrics";
  const result=await creatorAdminRoutes(adminReq(path),{setHeader(){}},path,response,{
    env:adminEnv,
    query:adminQuery(async(sql)=>{
      assert.match(sql,/creator_referrals/);
      assert.match(sql,/creator_commissions/);
      return {rows:[{code:"stock-creator",status:"approved",signups:8,first_paid_invoices:2,commission_candidates_cents:2000}]};
    })});
  assert.equal(result.status,200);
  assert.deepEqual([result.body.partners[0].signups,result.body.partners[0].first_paid_invoices],[8,2]);
  assert.match(result.body.note,/not paid customers/);
});

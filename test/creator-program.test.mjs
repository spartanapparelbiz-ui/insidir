import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReferralCode, normalizeHandle, commissionEligibleInvoice, recordFirstPaidInvoice, creatorAdminRoutes } from "../src/creator-program.mjs";

const valid={id:"in_test123",customer:"cus_test123",status:"paid",currency:"usd",amount_paid:3900,billing_reason:"subscription_create"};
test("referral codes are strictly bounded and normalized",()=>{
  assert.equal(normalizeReferralCode(" Test-Creator "),"test-creator");
  for(const code of [null,"","a","x".repeat(50),"hello.world","bad/case","éxample","x y"])
    assert.equal(normalizeReferralCode(code),null);
  assert.equal(normalizeHandle("@Creator.Name"),"creator.name");
  assert.equal(normalizeHandle("bad/name"),null);
});
test("only genuinely paid initial subscription invoices qualify",()=>{
  assert.equal(commissionEligibleInvoice(valid),true);
  for(const change of [{status:"open"},{amount_paid:0},{amount_paid:3899},{currency:"eur"},{billing_reason:"subscription_cycle"},{id:"oops"},{customer:"oops"}])
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
    "/v1/creators/admin/commissions",()=>{},{env:{},query:async()=>({rows:[]})}),e=>e.status===401);
});

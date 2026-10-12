import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {brokerageConfigured,validRedirectUri,safeEndpoint,oauthChallenge,normalizedPosition,
  validateReadTokens} from "../src/brokerage.mjs";

test("OAuth callback URL must be exact and HTTPS outside localhost",()=>{
  assert.equal(validRedirectUri("https://insidir.com/v1/me/brokerage/callback"),true);
  assert.equal(validRedirectUri("http://127.0.0.1:8080/v1/me/brokerage/callback"),true);
  assert.equal(validRedirectUri("http://insidir.com/v1/me/brokerage/callback"),false);
  assert.equal(validRedirectUri("https://insidir.com/v1/me/brokerage/callback?next=https://evil.com"),false);
  assert.equal(validRedirectUri("https://insidir.com/somewhere-else"),false);
});
test("OAuth endpoints cannot redirect token exchange or consent to arbitrary hosts",()=>{
  assert.equal(safeEndpoint("https://dashboard.snaptrade.com/oauth/authorize","authorization"),
    "https://dashboard.snaptrade.com/oauth/authorize");
  assert.equal(safeEndpoint("https://api.snaptrade.com/oauth/token/","token"),
    "https://api.snaptrade.com/oauth/token/");
  for(const url of ["https://dashboard.snaptrade.com.evil.example/oauth/authorize",
    "http://dashboard.snaptrade.com/oauth/authorize","https://api.snaptrade.com/snapTrade/registerUser",
    "https://api.snaptrade.com/oauth/token/?redirect=https://evil.example"])
    assert.equal(safeEndpoint(url,"token"),null);
});
test("OAuth accepts only exact read scope, rejects trade and malformed tokens",()=>{
  const base={access_token:"access",refresh_token:"refresh",scope:"read",expires_in:36000,token_type:"Bearer"};
  assert.equal(validateReadTokens(base).access,"access");
  for(const scope of ["read trade","trade","openid read","",null]) {
    assert.throws(()=>validateReadTokens({...base,scope}),{status:502});
  }
  assert.throws(()=>validateReadTokens({...base,refresh_token:null}),{status:502});
  assert.equal(validateReadTokens({...base,scope:undefined},{refresh:true}).refresh,"refresh");
  assert.throws(()=>validateReadTokens({...base,scope:"read trade"},{refresh:true}),{status:502});
  assert.equal(oauthChallenge("test-verifier").length,43);
  assert.equal(typeof brokerageConfigured(),"boolean");
});
test("portfolio exposes research link only for narrowly matched U.S. common stocks",()=>{
  const basic={instrument:{kind:"stock",symbol:"AAPL",raw_symbol:"AAPL",exchange:"XNAS",currency:"USD",description:"Apple"},
    units:"1.25",price:"200",currency:"USD"};
  assert.deepEqual(normalizedPosition(basic),{kind:"stock",symbol:"AAPL",description:"Apple",quantity:1.25,
    price:200,currency:"USD",researchTicker:"AAPL"});
  assert.equal(normalizedPosition({...basic,instrument:{...basic.instrument,kind:"option"}}).researchTicker,null);
  assert.equal(normalizedPosition({...basic,instrument:{...basic.instrument,symbol:"SHOP.TO",raw_symbol:"SHOP.TO",exchange:"XTSE",currency:"CAD"}}).researchTicker,null);
  assert.equal(normalizedPosition({...basic,instrument:{...basic.instrument,kind:"etf"}}).researchTicker,null);
  assert.equal(normalizedPosition({instrument:null}),null);
});
test("encrypted OAuth tokens require the right user and cannot be read from ciphertext",()=>{
  const snippet=`import {encryptBrokerageToken,decryptBrokerageToken} from "./src/brokerage.mjs";
const user="00000000-0000-0000-0000-000000000001",other="00000000-0000-0000-0000-000000000002";
const ciphertext=encryptBrokerageToken("private-token",user,"refresh");
if(ciphertext.includes("private-token"))throw new Error("Plaintext stored");
if(decryptBrokerageToken(ciphertext,user,"refresh")!=="private-token")throw new Error("Invalid roundtrip");
let rejected=false;try{decryptBrokerageToken(ciphertext,other,"refresh")}catch{rejected=true}
if(!rejected)throw new Error("Cross-user decryption succeeded");
rejected=false;try{decryptBrokerageToken(ciphertext,user,"access")}catch{rejected=true}
if(!rejected)throw new Error("Cross-purpose decryption succeeded");
`;
  const result=spawnSync(process.execPath,["--input-type=module","-e",snippet],{
    cwd:process.cwd(),encoding:"utf8",env:{...process.env,BROKERAGE_ENCRYPTION_KEY:"42".repeat(32)},
    timeout:10000
  });
  assert.equal(result.status,0,result.stderr);
});

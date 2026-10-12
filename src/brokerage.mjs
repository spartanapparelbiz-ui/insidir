/* SnapTrade OAuth, read scope only. No order, trading, brokerage password or token data ever sent to browsers.
 * User grants access in SnapTrade Personal. Tokens are AES-256-GCM-encrypted at rest with per-user AAD.
 */
import {randomBytes,createCipheriv,createDecipheriv,createHash} from "node:crypto";
import {config} from "./config.mjs";
import {query,requireDb} from "./db.mjs";

const apiHost="api.snaptrade.com", authHost="dashboard.snaptrade.com";
const fault=(status,message)=>Object.assign(new Error(message),{status});
const digest=value=>createHash("sha256").update(value).digest("hex");
const b64=bytes=>Buffer.from(bytes).toString("base64url");
let discovery=null;

export function brokerageConfigured() {
  return Boolean(config.brokerageConnectEnabled && config.snaptradeOAuthClientId &&
    config.snaptradeOAuthClientSecret && /^[a-f0-9]{64}$/i.test(config.brokerageEncryptionKey) &&
    validRedirectUri(config.snaptradeOAuthRedirectUri));
}
export function validRedirectUri(input) {
  try {
    const uri=new URL(input);
    const local=uri.hostname==="localhost"||uri.hostname==="127.0.0.1"||uri.hostname==="[::1]";
    return Boolean((uri.protocol==="https:"||(local&&uri.protocol==="http:")) &&
      !uri.username&&!uri.password&&!uri.hash&&!uri.search &&
      uri.pathname==="/v1/me/brokerage/callback");
  } catch{return false;}
}
function key() {
  if (!/^[a-f0-9]{64}$/i.test(config.brokerageEncryptionKey))throw fault(503,"Brokerage encryption is not configured");
  return Buffer.from(config.brokerageEncryptionKey,"hex");
}
export function encryptBrokerageToken(value,userId,kind) {
  if(typeof value!=="string"||!value||value.length>16384)throw new Error("Invalid secret");
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
  cipher.setAAD(Buffer.from(userId+":"+kind));
  const result=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return "v1:"+b64(iv)+":"+b64(cipher.getAuthTag())+":"+b64(result);
}
export function decryptBrokerageToken(ciphertext,userId,kind) {
  const [version,nonce,tag,data]=String(ciphertext||"").split(":");
  if(version!=="v1"||!nonce||!tag||!data)throw new Error("Invalid ciphertext");
  const iv=Buffer.from(nonce,"base64url"),authTag=Buffer.from(tag,"base64url");
  if(iv.length!==12||authTag.length!==16)throw new Error("Invalid ciphertext");
  const dec=createDecipheriv("aes-256-gcm",key(),iv);
  dec.setAAD(Buffer.from(userId+":"+kind));dec.setAuthTag(authTag);
  return Buffer.concat([dec.update(Buffer.from(data,"base64url")),dec.final()]).toString("utf8");
}
export function oauthChallenge(verifier) {
  return b64(createHash("sha256").update(verifier).digest());
}
export function safeEndpoint(value,type) {
  try {
    const uri=new URL(value);
    const host=type==="authorization"?authHost:apiHost;
    if(uri.protocol!=="https:"||uri.hostname!==host||uri.port||uri.username||uri.password||
      uri.search||uri.hash||!uri.pathname.startsWith("/oauth/"))return null;
    return uri.toString();
  } catch{return null;}
}
async function jsonRequest(url,options={},max=1_000_000) {
  const timeout=AbortSignal.timeout(12000);
  let response;
  try {response=await fetch(url,{...options,signal:timeout,redirect:"error",headers:{Accept:"application/json",...(options.headers||{})}});}
  catch {throw fault(503,"Brokerage provider is temporarily unavailable");}
  if(!response.ok) {
    if(response.status===401||response.status===403)throw fault(401,"Brokerage authorization expired. Reconnect your account.");
    if(response.status===429)throw fault(429,"Brokerage provider rate limit reached. Try later.");
    throw fault(502,"Brokerage provider request failed");
  }
  if(Number(response.headers.get("content-length")||0)>max)throw fault(502,"Brokerage response too large");
  const content=await response.text();
  if(content.length>max)throw fault(502,"Brokerage response too large");
  try {return JSON.parse(content);} catch {throw fault(502,"Brokerage provider returned invalid JSON");}
}
export async function metadata() {
  if(discovery&&discovery.expires>Date.now())return discovery.data;
  const d=await jsonRequest("https://api.snaptrade.com/.well-known/oauth-authorization-server");
  const result={
    authorization:safeEndpoint(d.authorization_endpoint,"authorization"),
    token:safeEndpoint(d.token_endpoint,"token"),
    revocation:safeEndpoint(d.revocation_endpoint,"revocation")
  };
  if(!result.authorization||!result.token||!result.revocation)throw fault(503,"Brokerage OAuth endpoints could not be verified");
  discovery={data:result,expires:Date.now()+60*60*1000};
  return result;
}
export function authorizeUrl(endpoint,{state,challenge}) {
  const safe=safeEndpoint(endpoint,"authorization");
  if(!safe)throw fault(503,"Untrusted brokerage authorization endpoint");
  const url=new URL(safe);
  url.searchParams.set("response_type","code");
  url.searchParams.set("client_id",config.snaptradeOAuthClientId);
  url.searchParams.set("redirect_uri",config.snaptradeOAuthRedirectUri);
  url.searchParams.set("scope","read");
  url.searchParams.set("state",state);
  url.searchParams.set("code_challenge",challenge);
  url.searchParams.set("code_challenge_method","S256");
  return url.toString();
}
async function tokenRequest(fields) {
  const d=await metadata();
  return jsonRequest(d.token,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded",
      Authorization:"Basic "+Buffer.from(config.snaptradeOAuthClientId+":"+config.snaptradeOAuthClientSecret).toString("base64")},
    body:new URLSearchParams(fields)
  });
}
export function validateReadTokens(value,{refresh=false}={}) {
  const scope=refresh && value?.scope==null?"read":value?.scope;
  if(!value||typeof value.access_token!=="string"||!value.access_token||
    typeof value.refresh_token!=="string"||!value.refresh_token||
    typeof scope!=="string"||scope.trim()!=="read"||
    typeof value.expires_in!=="number"||value.expires_in<60||value.expires_in>86400||
    typeof value.token_type!=="string"||value.token_type.toLowerCase()!=="bearer")
    throw fault(502,"Brokerage did not grant the required read-only scope");
  return {access:value.access_token,refresh:value.refresh_token,expiresAt:new Date(Date.now()+value.expires_in*1000)};
}
export async function startBrokerageLink(userId) {
  if(!brokerageConfigured())throw fault(503,"Brokerage connections are not enabled");
  const prior=await query("SELECT 1 FROM brokerage_oauth_tokens WHERE user_id=$1",[userId]);
  if(prior.rowCount)throw fault(409,"Brokerage already connected. Disconnect before connecting again.");
  const endpoints=await metadata();
  const verifier=b64(randomBytes(48)),state=b64(randomBytes(32));
  await query(`INSERT INTO brokerage_oauth_pending(user_id,state_hash,verifier_encrypted,expires_at)
    VALUES($1,$2,$3,now()+interval '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET state_hash=EXCLUDED.state_hash,
      verifier_encrypted=EXCLUDED.verifier_encrypted,expires_at=EXCLUDED.expires_at`,
    [userId,digest(state),encryptBrokerageToken(verifier,userId,"verifier")]);
  return authorizeUrl(endpoints.authorization,{state,challenge:oauthChallenge(verifier)});
}
export async function finishBrokerageLink(userId,{state,code,error}) {
  if(!brokerageConfigured())throw fault(503,"Brokerage connections are not enabled");
  if(typeof state!=="string"||! /^[A-Za-z0-9_-]{32,96}$/.test(state))throw fault(400,"Invalid brokerage state");
  const consumed=await query(`DELETE FROM brokerage_oauth_pending WHERE user_id=$1 AND state_hash=$2
    AND expires_at>now() RETURNING verifier_encrypted`,[userId,digest(state)]);
  if(!consumed.rowCount)throw fault(400,"Brokerage authorization expired or could not be verified");
  if(error)throw fault(400,"Brokerage authorization was cancelled");
  if(typeof code!=="string"||!code||code.length>2048)throw fault(400,"Invalid authorization result");
  const verifier=decryptBrokerageToken(consumed.rows[0].verifier_encrypted,userId,"verifier");
  const tokens=validateReadTokens(await tokenRequest({
    grant_type:"authorization_code",code,code_verifier:verifier,
    redirect_uri:config.snaptradeOAuthRedirectUri
  }));
  const inserted=await query(`INSERT INTO brokerage_oauth_tokens(user_id,access_encrypted,refresh_encrypted,expires_at,granted_scope)
    VALUES($1,$2,$3,$4,'read') ON CONFLICT(user_id) DO NOTHING`,
    [userId,encryptBrokerageToken(tokens.access,userId,"access"),
      encryptBrokerageToken(tokens.refresh,userId,"refresh"),tokens.expiresAt]);
  if(!inserted.rowCount)throw fault(409,"A connection already exists; disconnect before reconnecting");
  return true;
}
export async function connectionStatus(userId) {
  const r=await query("SELECT connected_at,expires_at FROM brokerage_oauth_tokens WHERE user_id=$1",[userId]);
  return {available:brokerageConfigured(),connected:Boolean(r.rowCount),
    connectedAt:r.rows[0]?.connected_at||null,permission:"read",
    provider:"SnapTrade Personal",executionEnabled:false};
}
async function validAccessToken(userId) {
  // Lock protects refresh-token rotation across multiple workers and concurrent requests.
  const client=await requireDb().connect();
  try {
    await client.query("BEGIN");
    const r=await client.query("SELECT access_encrypted,refresh_encrypted,expires_at FROM brokerage_oauth_tokens WHERE user_id=$1 FOR UPDATE",[userId]);
    if(!r.rowCount)throw fault(409,"Connect a brokerage account first");
    const v=r.rows[0];
    if(new Date(v.expires_at).getTime()>Date.now()+120000){
      await client.query("COMMIT");
      return decryptBrokerageToken(v.access_encrypted,userId,"access");
    }
    const newTokens=validateReadTokens(await tokenRequest({
      grant_type:"refresh_token",refresh_token:decryptBrokerageToken(v.refresh_encrypted,userId,"refresh")
    }),{refresh:true});
    await client.query(`UPDATE brokerage_oauth_tokens SET access_encrypted=$2,refresh_encrypted=$3,
      expires_at=$4,updated_at=now() WHERE user_id=$1`,[userId,
      encryptBrokerageToken(newTokens.access,userId,"access"),
      encryptBrokerageToken(newTokens.refresh,userId,"refresh"),newTokens.expiresAt]);
    await client.query("COMMIT");
    return newTokens.access;
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
  finally{client.release();}
}
async function brokerGet(path,access) {
  if(! /^\/(accounts\/all|accounts\/[0-9a-f-]{36}\/positions\/all)$/.test(path))throw fault(400,"Invalid brokerage data request");
  return jsonRequest("https://api.snaptrade.com"+path,{headers:{Authorization:"Bearer "+access}},1_800_000);
}
export function normalizedPosition(position) {
  const instrument=position?.instrument;
  if(!instrument||typeof instrument!=="object")return null;
  const kind=String(instrument.kind||"other").slice(0,40);
  const raw=String(instrument.raw_symbol||instrument.symbol||"").toUpperCase();
  const usStock=kind==="stock" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(raw) &&
    (!instrument.exchange||/^(XNAS|XNYS|ARCX|BATS|IEXG|XASE|XNGS|XNMS)$/i.test(instrument.exchange)) &&
    (!instrument.currency||instrument.currency==="USD");
  const number=x=>x===null||x===undefined||x===""?null:Number.isFinite(Number(x))?Number(x):null;
  return {kind,symbol:String(instrument.symbol||raw).slice(0,48),
    description:String(instrument.description||"").slice(0,120),
    quantity:number(position.units),price:number(position.price),currency:String(position.currency||instrument.currency||"").slice(0,5),
    researchTicker:usStock?raw:null};
}
export async function readPortfolio(userId) {
  if(!brokerageConfigured())throw fault(503,"Brokerage connections are disabled");
  const access=await validAccessToken(userId);
  const accountsData=await brokerGet("/accounts/all",access);
  if(!Array.isArray(accountsData?.results))throw fault(502,"Invalid brokerage accounts data");
  const investments=accountsData.results.filter(a=>a?.kind==="investment");
  const accounts=[];
  const researchTickers=new Set();
  for(const a of investments.slice(0,8)) {
    if(!/^[0-9a-f-]{36}$/i.test(String(a.id||"")))continue;
    let positions=[],positionsAsOf=null,error=null;
    try {
      const r=await brokerGet("/accounts/"+a.id+"/positions/all",access);
      if(!Array.isArray(r.results))throw fault(502,"Invalid positions data");
      positions=r.results.slice(0,250).map(normalizedPosition).filter(Boolean);
      positionsAsOf=typeof r.data_freshness?.as_of==="string"?r.data_freshness.as_of:null;
    } catch(e){error=e.status===401?"Connection needs attention":"Positions temporarily unavailable";}
    positions.forEach(p=>{if(p.researchTicker)researchTickers.add(p.researchTicker);});
    accounts.push({id:a.id,name:String(a.display_name||"Brokerage account").slice(0,100),
      maskedNumber:"••••"+String(a.masked_account_number||"").replace(/\D/g,"").slice(-4),kind:"investment",
      netValue:a.net_value?.amount!=null&&Number.isFinite(Number(a.net_value.amount))?Number(a.net_value.amount):null,
      currency:String(a.net_value?.currency||"").slice(0,5),
      positionsAsOf,accountSyncedAt:a.sync_status?.positions||null,
      positions,error});
  }
  const tickers=[...researchTickers].slice(0,70);
  let recent=[];
  if(tickers.length){
    const q=await query(`SELECT DISTINCT ON (t.ticker) t.ticker,t.owner_name,t.category,
      t.transaction_date,t.source_url,f.published_at
      FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.ticker=ANY($1::text[]) AND f.ingest_status='parsed'
        AND f.published_at>=now()-interval '30 days'
      ORDER BY t.ticker,f.published_at DESC,t.transaction_date DESC NULLS LAST`,[tickers]);
    recent=q.rows.map(x=>({...x,note:"Ticker-only match; verify the security and the filing before drawing conclusions."}));
  }
  return {accounts,recentSecActivity:recent,readOnly:true,
    truncatedAccounts:investments.length>8,
    dataNote:"Holdings may be delayed or incomplete. SEC matches use ticker symbols only, not verified security identifiers. No brokerage orders are possible."};
}
export async function disconnectBrokerage(userId) {
  const exists=await query("SELECT refresh_encrypted FROM brokerage_oauth_tokens WHERE user_id=$1",[userId]);
  if(!exists.rowCount)return false;
  // Revoke refresh token before local deletion. If provider fails, allow retry so a live grant isn't silently abandoned.
  const refresh=decryptBrokerageToken(exists.rows[0].refresh_encrypted,userId,"refresh");
  const d=await metadata();
  let response;
  try {
    response=await fetch(d.revocation,{method:"POST",redirect:"error",signal:AbortSignal.timeout(12000),
      headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded",
        Authorization:"Basic "+Buffer.from(config.snaptradeOAuthClientId+":"+config.snaptradeOAuthClientSecret).toString("base64")},
      body:new URLSearchParams({token:refresh,token_type_hint:"refresh_token"})});
  }catch{throw fault(503,"Could not reach the brokerage to revoke access. Try again.");}
  if(!response.ok)throw fault(503,"Brokerage revocation was not confirmed. Try again.");
  await query("DELETE FROM brokerage_oauth_tokens WHERE user_id=$1",[userId]);
  return true;
}
export async function deletePendingBrokerage(userId) {
  await query("DELETE FROM brokerage_oauth_pending WHERE user_id=$1",[userId]);
}

import { createServer } from "node:http";
import { randomBytes,timingSafeEqual } from "node:crypto";
import { config,secReady } from "./config.mjs";
import { query,health } from "./db.mjs";
import { ingest } from "./ingest.mjs";
import { sourceRegistry,clusterPurchases } from "./analysis.mjs";
import { currentUser,register,login,revokeSession,sessionCookie,clearCookie,checkOrigin,passwordMatches } from "./auth.mjs";
import { serveStatic } from "./web.mjs";
import { billingRoutes,createStripeClient,deleteAccount } from "./billing.mjs";
import { gate,accessSummary,paywallNotices,privateCacheControl,mergeVary,unavailablePage } from "./paywall.mjs";
import { billingSettings } from "./config.mjs";
import { validateResearchDecision } from "./research.mjs";
import { handleCompanyRoute,clientAddress } from "./company-routes.mjs";
import { handlePersonRoute, hasFilingOwners, withJointOwners, JOINT_OWNERS_SQL, SAME_LINE, SUPERSEDED, RECENT_DISCLOSED } from "./person-profile.mjs";
import { loadOwnersFrom, loadIssuersFrom } from "./media-batch.mjs";
import { validateManualHolding } from "./manual-holdings.mjs";
import {brokerageConfigured,startBrokerageLink,finishBrokerageLink,connectionStatus,readPortfolio,disconnectBrokerage,deletePendingBrokerage} from "./brokerage.mjs";
const allowedMethods="GET,HEAD,POST,DELETE,OPTIONS";
const hits=new Map();
function isLimited(key,limit=15,windowMs=15*60*1000){
  const now=Date.now();
  if(hits.size>10000)for(const [k,v] of hits)if(v.until<now)hits.delete(k);
  const v=hits.get(key);
  if(!v || v.until<=now){hits.set(key,{count:1,until:now+windowMs});return false}
  v.count++;return v.count>limit;
}
// Read-only check, and a separate counter, so only failed attempts spend the allowance.
function atLimit(key,limit){const v=hits.get(key);return !!v && v.until>Date.now() && v.count>=limit}
function countFailure(key,windowMs=15*60*1000){isLimited(key,Infinity,windowMs)}
function json(res,status,body,headers={}) {
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin",
    "Permissions-Policy":"camera=(), microphone=(), geolocation=()",...headers});
  res.end(JSON.stringify(body));
}
const failure=(status,message)=>Object.assign(new Error(message),{status});
async function body(req) {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))throw failure(415,"Expected application/json");
  let bytes=0;const parts=[];
  for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw failure(413,"Payload too large");parts.push(chunk)}
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{throw failure(400,"Invalid JSON")}
}
function positive(value,defaultValue,max=100){const v=value==null?defaultValue:Number(value);return Number.isInteger(v)?Math.max(1,Math.min(max,v)):defaultValue}
function ticker(v){const t=String(v||"").trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t))throw failure(400,"Invalid ticker");return t}
async function requireUser(req,ctx) {const user=await ctx.currentUser(req);if(!user)throw failure(401,"Sign in required");return user}
const publicUser=user=>({id:user.id,email:user.email});
function redirect(res,location){
  res.writeHead(302,{"Location":location,"Cache-Control":"no-store","Content-Length":"0","X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin"});
  res.end();
}
/* Everything served past the paywall to a signed-in visitor (product data, product and
 * account pages) is marked private and varies by Cookie, so no shared cache or CDN can
 * replay one member's response to someone the gate would have stopped. */
function keepPrivate(res){
  const writeHead=res.writeHead;
  res.writeHead=function(status,...rest){
    const reason=typeof rest[0]==="string"?rest.shift():undefined;
    const headers=rest[0];
    const priorVary=res.getHeader("vary");
    if(headers&&typeof headers==="object"&&!Array.isArray(headers))for(const [name,value] of Object.entries(headers))if(value!==undefined)res.setHeader(name,value);
    res.setHeader("Cache-Control",privateCacheControl(res.getHeader("cache-control")));
    res.setHeader("Vary",mergeVary(priorVary,res.getHeader("vary"),"Cookie"));
    return reason===undefined?writeHead.call(this,status):writeHead.call(this,status,reason);
  };
}
/* Followed people (GET/POST /v1/me/people, DELETE /v1/me/people/<cik>, GET /v1/me/people/updates).
 *
 * One canonical owner CIK: POST stores the 10-digit form the SEC files under, whatever form the client
 * sends ("1214156" and "0001214156" are one person). Rows written before that may hold another form, so
 * every read, the duplicate check and DELETE compare without leading zeros (LTRIM(owner_cik,'0')), and
 * the follow set below holds each person once. A person's lines are read in both forms off
 * sec_transactions_owner_idx: owner_cik IN (bare, 10-digit) is the same comparison for CIKs of up to
 * 10 digits and keeps the index. Answers give owner_cik in the 10-digit form.
 *
 * Joint filings: a Form 4 with several reporting owners stores its lines once with owner_cik NULL.
 * When sec_filing_owners exists (sql/008; hasFilingOwners, the check person-profile.mjs uses), those
 * lines count for every owner it lists: a person who only files jointly can be followed, has a name
 * and ticker on the list, and their joint lines are in the feed. Every joint line in an answer carries
 * owners: [{cik, name}] (as filed, in filing order) so a page can link each owner.
 *
 * GET /v1/me/people/updates: the member's followed people, most recently active first, and the newest
 * Form 4 lines any of them filed. Three fixed round trips at most (plus the owners of joint lines),
 * never one per person. The work is bounded by the follow set: POST caps it at MAX_FOLLOWS, and the
 * queries read at most the MAX_FOLLOWS newest follows (followed_people_created_idx) before any
 * per-person join. A person whose filings are all unparsed (e.g. a failed re-ingest) still gets a name
 * and ticker. The 30-day totals count each line once across later Form 4/A restatements by the profile's
 * own rule (SAME_LINE / SUPERSEDED from person-profile.mjs): a line repeated by a later 4/A counts once,
 * on the date it was first filed, so a restated old trade does not enter the window. */
const MAX_FOLLOWS=150;
const RECENT_DAYS="now()-interval '30 days'";
// "0001214156" | "1214156" -> "0001214156"; null when it is not an SEC CIK.
export function canonicalOwnerCik(value){
  const s=String(value??"").trim();
  if(!/^\d{1,12}$/.test(s))return null;
  const bare=s.replace(/^0+/,"");
  return bare&&bare.length<=10?bare.padStart(10,"0"):null;
}
// The member's follow set, each person once (bare and 10-digit forms), newest MAX_FOLLOWS rows first.
const FOLLOW_SET=`fp AS MATERIALIZED (SELECT n.bare,LPAD(n.bare,10,'0') AS owner_cik,MIN(n.created_at) AS created_at
  FROM (SELECT LTRIM(owner_cik,'0') AS bare,created_at FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT ${MAX_FOLLOWS}) n
  WHERE n.bare<>'' GROUP BY n.bare)`;
const FOLLOW_COUNT="(SELECT count(DISTINCT LTRIM(owner_cik,'0')) FROM followed_people WHERE user_id=$1)::integer";
const SAME_PERSON="IN (fp.bare,fp.owner_cik)";
/* One followed person's lines (for the follow row fp): their own, plus with sec_filing_owners the joint
 * filings that list them, whose owner_name is then the person's own name as filed there. */
function personLines(joint,columns){
  const own=columns.map(c=>"t."+c).join(","),shared=columns.map(c=>c==="owner_name"?"o.owner_name":"t."+c).join(",");
  return `(SELECT ${own} FROM sec_transactions t WHERE t.owner_cik ${SAME_PERSON}`+(joint?`
    UNION ALL SELECT ${shared} FROM sec_filing_owners o JOIN sec_transactions t ON t.accession=o.accession AND t.owner_cik IS NULL WHERE o.owner_cik ${SAME_PERSON})`:")");
}
const LINE_COLUMNS=["id","accession","owner_name","ticker","issuer_cik","transaction_date","transaction_code","acquired_disposed","derivative","shares","category","estimated_value"];
/* One followed person in a single pass over their parsed lines (one sec_filings probe per line): the
 * latest line (the feed's ordering) and the 30-day measures, counting restated lines once by the
 * profile's rule (person-profile.mjs SAME_LINE / SUPERSEDED): each line's key is computed once; a line
 * is superseded when a later 4/A repeats it, and a 4/A copy is dated by the first filing of that line.
 * Only keys that a 4/A carries are grouped. filings_30d counts filings published in the window. */
const personSummary=joint=>`WITH lines AS MATERIALIZED (SELECT t.*,f.published_at,f.is_amendment,f.issuer_name,${SAME_LINE} AS same
    FROM ${personLines(joint,LINE_COLUMNS)} t JOIN sec_filings f ON f.accession=t.accession WHERE f.ingest_status='parsed'),
  amended AS (SELECT t.same,MAX(t.published_at) AS amended_at FROM lines t WHERE t.is_amendment GROUP BY t.same),
  copies AS (SELECT a.same,a.amended_at,MIN(t.published_at) AS first_published_at FROM amended a JOIN lines t ON t.same=a.same GROUP BY a.same,a.amended_at),
  c AS (SELECT t.accession,t.transaction_date,t.category,t.estimated_value,t.published_at,${SUPERSEDED("k.amended_at","t.published_at")} AS superseded,
    CASE WHEN t.is_amendment THEN k.first_published_at ELSE t.published_at END AS disclosed_at
    FROM lines t LEFT JOIN copies k ON k.same=t.same),
  latest AS (SELECT t.id,t.owner_name,t.ticker,t.issuer_name FROM lines t ORDER BY t.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST,t.id DESC LIMIT 1)
  SELECT l.id AS last_id,l.owner_name,l.ticker,l.issuer_name,m.* FROM (SELECT MAX(c.published_at) AS last_published_at,MAX(c.transaction_date) AS last_transaction_date,
    (COUNT(DISTINCT c.accession) FILTER (WHERE c.published_at>=${RECENT_DAYS}))::integer AS filings_30d,
    (COUNT(*) FILTER (WHERE NOT c.superseded AND ${RECENT_DISCLOSED}))::integer AS transactions_30d,
    COALESCE(SUM(c.estimated_value) FILTER (WHERE c.category='reported_purchase' AND NOT c.superseded AND ${RECENT_DISCLOSED}),0) AS purchases_30d_value,
    COALESCE(SUM(c.estimated_value) FILTER (WHERE c.category='reported_sale' AND NOT c.superseded AND ${RECENT_DISCLOSED}),0) AS sales_30d_value
    FROM c) m LEFT JOIN latest l ON true`;
function followSql(joint){
  const people=`WITH ${FOLLOW_SET}
SELECT fp.owner_cik,fp.created_at AS followed_at,${FOLLOW_COUNT} AS following,
  s.last_id,s.issuer_name,COALESCE(s.owner_name,n.owner_name) AS owner_name,COALESCE(s.ticker,n.ticker) AS ticker,
  s.last_published_at,s.last_transaction_date,s.filings_30d,s.transactions_30d,s.purchases_30d_value,s.sales_30d_value
  FROM fp
  LEFT JOIN LATERAL (${personSummary(joint)}) s ON true
  LEFT JOIN LATERAL (SELECT x.owner_name,x.ticker FROM ${personLines(joint,["owner_name","ticker","transaction_date"])} x
    WHERE s.last_id IS NULL ORDER BY x.transaction_date DESC NULLS LAST LIMIT 1) n ON true
  ORDER BY s.last_published_at DESC NULLS LAST,fp.created_at DESC,fp.owner_cik
  LIMIT ${MAX_FOLLOWS}`;
  /* Same row shape as GET /v1/transactions items. Own lines belong to one person each; joint lines are
   * read once per filing (a semi-join on the follow set), so a joint line listing two followed people
   * appears once. */
  const lines=joint?`SELECT t.* FROM fp JOIN sec_transactions t ON t.owner_cik ${SAME_PERSON}
    UNION ALL SELECT t.* FROM sec_transactions t WHERE t.owner_cik IS NULL AND t.accession IN (SELECT o.accession FROM fp JOIN sec_filing_owners o ON o.owner_cik ${SAME_PERSON})`
    :`SELECT t.* FROM fp JOIN sec_transactions t ON t.owner_cik ${SAME_PERSON}`;
  const items=`WITH ${FOLLOW_SET}
SELECT t.*,f.issuer_name,f.published_at,f.is_amendment
  FROM (${lines}) t JOIN sec_filings f ON f.accession=t.accession
  WHERE f.ingest_status='parsed'
  ORDER BY f.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST,t.id DESC
  LIMIT $2`;
  // GET /v1/me/people: the follow list, newest follow first; name and ticker from the latest trade.
  const list=`WITH ${FOLLOW_SET}
SELECT fp.owner_cik,fp.created_at,s.owner_name,s.ticker,s.last_transaction_date,s.last_published_at
  FROM fp
  LEFT JOIN LATERAL (WITH lines AS MATERIALIZED (SELECT x.owner_name,x.ticker,x.transaction_date,f.published_at,f.ingest_status
      FROM ${personLines(joint,["accession","owner_name","ticker","transaction_date"])} x JOIN sec_filings f ON f.accession=x.accession)
    SELECT n.owner_name,n.ticker,m.last_transaction_date,m.last_published_at
    FROM (SELECT MAX(l.transaction_date) AS last_transaction_date,MAX(l.published_at) FILTER (WHERE l.ingest_status='parsed') AS last_published_at FROM lines l) m
    LEFT JOIN (SELECT l.owner_name,l.ticker FROM lines l ORDER BY l.transaction_date DESC NULLS LAST LIMIT 1) n ON true) s ON true
  ORDER BY fp.created_at DESC,fp.owner_cik
  LIMIT ${MAX_FOLLOWS}`;
  // POST /v1/me/people: is this CIK (either form) a reporting person in the import?
  const known=joint?`SELECT 1 FROM sec_transactions WHERE owner_cik=ANY($1::text[])
  UNION ALL SELECT 1 FROM sec_filing_owners WHERE owner_cik=ANY($1::text[]) LIMIT 1`:"SELECT 1 FROM sec_transactions WHERE owner_cik=ANY($1::text[]) LIMIT 1";
  return Object.freeze({people,items,list,known});
}
export const FOLLOW_SQL=Object.freeze({single:followSql(false),joint:followSql(true)});
/* POST /v1/me/people: a person already followed in any stored form is answered with that row and nothing
 * is inserted; otherwise the canonical form is inserted while the member is under the cap. Re-following
 * (even at the cap, or racing a double click: ON CONFLICT returns the row) never fails. */
export const FOLLOW_INSERT_SQL=`WITH existing AS (SELECT owner_cik FROM followed_people WHERE user_id=$1 AND LTRIM(owner_cik,'0')=LTRIM($2,'0') ORDER BY created_at LIMIT 1),
  inserted AS (INSERT INTO followed_people(user_id,owner_cik)
    SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM existing) AND (SELECT count(*) FROM followed_people WHERE user_id=$1)<${MAX_FOLLOWS}
    ON CONFLICT(user_id,owner_cik) DO UPDATE SET created_at=followed_people.created_at RETURNING owner_cik)
SELECT owner_cik FROM existing UNION ALL SELECT owner_cik FROM inserted`;
export const FOLLOW_DELETE_SQL="DELETE FROM followed_people WHERE user_id=$1 AND LTRIM(owner_cik,'0')=LTRIM($2,'0')";
const TRANSACTIONS_BY_ID_SQL=`SELECT t.*,f.issuer_name,f.published_at,f.is_amendment
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.id=ANY($1::text[])`;
/* The owners of joint lines: JOINT_OWNERS_SQL / withJointOwners live in person-profile.mjs (one helper
 * for the profile and every route here); JOINT_OWNERS_SQL is re-exported for the tests. */
export { JOINT_OWNERS_SQL };
/* GET /v1/insiders: reporting people, newest line first, each person once (padded and unpadded owner
 * CIKs merged; owner_cik answered in the 10-digit form). With sec_filing_owners, owners of joint
 * filings are listed too, under the name they filed with there, so a person who only files jointly
 * can be found from the people directory and the header search. ticker and issuer_cik are from the
 * person's newest line; filings counts distinct filings. q matches the name filed (as before). */
const INSIDER_PICK="(ARRAY_AGG(l.%s ORDER BY l.transaction_date DESC NULLS LAST,l.accession DESC))[1]";
const pick=c=>INSIDER_PICK.replace("%s",c)+" AS "+c;
function insidersSql(joint){
  const own=`SELECT LTRIM(t.owner_cik,'0') AS bare,t.owner_name,t.ticker,t.issuer_cik,t.accession,t.transaction_date FROM sec_transactions t
    WHERE t.owner_cik IS NOT NULL AND ($1::text='' OR t.owner_name ILIKE '%'||$1||'%')`;
  const shared=`SELECT LTRIM(o.owner_cik,'0'),o.owner_name,t.ticker,t.issuer_cik,t.accession,t.transaction_date FROM sec_filing_owners o
    JOIN sec_transactions t ON t.accession=o.accession AND t.owner_cik IS NULL
    WHERE ($1::text='' OR o.owner_name ILIKE '%'||$1||'%')`;
  return `SELECT LPAD(l.bare,10,'0') AS owner_cik,${pick("owner_name")},${pick("ticker")},
  LPAD(LTRIM(${INSIDER_PICK.replace("%s","issuer_cik")},'0'),10,'0') AS issuer_cik,
  COUNT(DISTINCT l.accession)::integer AS filings,MAX(l.transaction_date) AS last_transaction_date
  FROM (${own}${joint?"\n  UNION ALL "+shared:""}) l
  WHERE l.bare<>'' GROUP BY l.bare ORDER BY last_transaction_date DESC NULLS LAST,l.bare LIMIT 100`;
}
export const INSIDERS_SQL=Object.freeze({single:insidersSql(false),joint:insidersSql(true)});
const toCount=v=>{const n=Number(v);return Number.isFinite(n)?Math.trunc(n):0};
const toAmount=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
async function followedPeopleUpdates(userId,limit,run=query){
  const base={source:"SEC Form 4",disclaimer:"Reported purchases and sales are not recommendations or predictive signals."};
  const joint=await hasFilingOwners(run),sql=joint?FOLLOW_SQL.joint:FOLLOW_SQL.single;
  const people=(await run(sql.people,[userId])).rows;
  if(!people.length)return {people:[],items:[],following:0,...base};
  const items=(await run(sql.items,[userId,limit])).rows;
  // A person's latest line is usually already in the feed (same ordering); fetch only the rest.
  const byId=new Map(items.map(row=>[row.id,row]));
  const missing=[...new Set(people.map(row=>row.last_id).filter(id=>id!=null&&!byId.has(id)))];
  if(missing.length)for(const row of (await run(TRANSACTIONS_BY_ID_SQL,[missing])).rows)byId.set(row.id,row);
  await withJointOwners([...byId.values()],run,joint);
  return {
    people:people.map(row=>({owner_cik:row.owner_cik,owner_name:row.owner_name??null,followed_at:row.followed_at,
      ticker:row.ticker??null,issuer_name:row.issuer_name??null,
      last_published_at:row.last_published_at??null,last_transaction_date:row.last_transaction_date??null,
      last:row.last_id==null?null:byId.get(row.last_id)??null,
      filings_30d:toCount(row.filings_30d),transactions_30d:toCount(row.transactions_30d),
      purchases_30d_value:toAmount(row.purchases_30d_value),sales_30d_value:toAmount(row.sales_30d_value)})),
    items,
    following:toCount(people[0].following),
    ...base
  };
}
const pageCsp="default-src 'self'; img-src 'self' data: https://upload.wikimedia.org https://thumb.wikimedia.org; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
// The paywall could not check the session (e.g. the database is unreachable): stay closed,
// but answer a page navigation with a readable page rather than a JSON error.
function unavailable(req,res,u){
  const page=unavailablePage(u);
  res.writeHead(503,{"Content-Type":"text/html; charset=utf-8","Content-Length":Buffer.byteLength(page),"Cache-Control":"no-store","Retry-After":"30",
    "Content-Security-Policy":pageCsp,"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin",
    "Permissions-Policy":"camera=(), microphone=(), geolocation=()"});
  res.end(req.method==="HEAD"?undefined:page);
}
function reqOrigin(req,res){
  const origin=req.headers.origin;
  if(!origin)return;
  if(checkOrigin(req)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Vary","Origin")}
}
async function route(req,res,ctx){
  const u=new URL(req.url||"/","http://localhost");
  const p=u.pathname,m=req.method||"GET";
  reqOrigin(req,res);
  if(m==="OPTIONS"){
    if(!checkOrigin(req))return json(res,403,{error:"Origin not allowed"});
    res.setHeader("Access-Control-Allow-Methods",allowedMethods);
    res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age","600");
    return json(res,204,{});
  }
  if(!["GET","HEAD","POST","DELETE"].includes(m))throw failure(405,"Method not allowed");
  // Hard paywall: decided before any page, company report or product API is served.
  let decision;
  try{decision=await gate({req,url:u,loadUser:ctx.currentUser,env:ctx.env})}
  catch(error){
    console.error("Paywall check failed",error);
    if((m==="GET"||m==="HEAD")&&!p.startsWith("/v1/")&&p!=="/v1"&&p!=="/healthz")return unavailable(req,res,u);
    return json(res,503,{error:"Insidir could not check your account just now. Try again shortly."},{"Retry-After":"30"});
  }
  if(decision.action==="redirect")return redirect(res,decision.location);
  if(decision.action==="deny")return json(res,decision.status,decision.body);
  if(decision.kind==="product"||decision.kind==="account")keepPrivate(res);
  if(p==="/v1" && m==="GET")return json(res,200,{name:"Insidir Engine",service:"api",documentation:"/v1/sources",advice:false});
  if((m==="GET"||m==="HEAD") && !p.startsWith("/v1/") && p!=="/healthz" && await serveStatic(req,res))return;
  if(p==="/healthz" && m==="GET"){const h=await health();return json(res,h.ok?200:503,{...h,secUserAgentConfigured:secReady()})}
  if(m==="GET"||m==="HEAD"){
    const handled=await handleCompanyRoute(req,res,u,{loadTransactions:async t=>(await query(`SELECT t.id,t.issuer_cik,t.ticker,t.owner_name,t.category,t.transaction_date,
      t.transaction_code,t.derivative,t.estimated_value,t.source_url,f.published_at
      FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.ticker=$1 AND f.ingest_status='parsed'
      ORDER BY f.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST LIMIT 30`,[t]).catch(()=>({rows:[]}))).rows,
      // GET /v1/media confirms reporting owners (and their filed names; joint filers through
      // sec_filing_owners) and issuers from the SEC import; new upstream work is budgeted per member
      // (else per address).
      loadOwners:async pairs=>loadOwnersFrom(ctx.query,pairs,{joint:await hasFilingOwners(ctx.query)}),loadIssuers:ciks=>loadIssuersFrom(ctx.query,ciks),
      requester:decision.user?.id!=null?"user:"+decision.user.id:null});
    if(handled!==false)return;
  }
  // GET /v1/people/<cik>: one reporting person's profile (src/person-profile.mjs); product data.
  if(await handlePersonRoute(req,res,u,{query:ctx.query,requireUser:async r=>decision.user||requireUser(r,ctx)})!==false)return;
  if(p.startsWith("/v1/billing/")) { const result=await billingRoutes(req,res,p,json,{currentUser:ctx.currentUser,env:ctx.env,stripe:ctx.stripe}); if(result!==false) return result; }
  if(p==="/v1/me/brokerage/callback" && m==="GET"){
    // Top-level OAuth redirect uses the existing signed-in session; state is single-use and bound to this user.
    let outcome="error";
    try {
      const user=await requireUser(req,ctx);
      await finishBrokerageLink(user.id,{
        state:u.searchParams.get("state"),code:u.searchParams.get("code"),error:u.searchParams.get("error")
      });
      outcome="connected";
    } catch(e) {
      if(e.status===401)outcome="signin";
      else if(e.message==="Brokerage authorization was cancelled")outcome="cancelled";
    }
    res.writeHead(303,{"Location":outcome==="signin"?"/signin.html":"/portfolio.html?connection="+outcome,
      "Cache-Control":"no-store","Referrer-Policy":"no-referrer",
      "X-Content-Type-Options":"nosniff"});
    return res.end();
  }
  if(p==="/v1/me/brokerage/status" && m==="GET"){
    const user=await requireUser(req,ctx);
    return json(res,200,await connectionStatus(user.id));
  }
  if(p==="/v1/me/brokerage/portfolio" && m==="GET"){
    const user=await requireUser(req,ctx);
    if(isLimited("portfolio:"+user.id,12,60*1000))throw failure(429,"Too many portfolio refreshes");
    return json(res,200,await readPortfolio(user.id));
  }
  if(p==="/v1/me/brokerage/connect" && m==="POST"){
    if(!checkOrigin(req))throw failure(403,"Untrusted Origin");
    const user=await requireUser(req,ctx);
    if(isLimited("broker-connect:"+user.id,4,15*60*1000))throw failure(429,"Too many connection attempts");
    return json(res,200,{url:await startBrokerageLink(user.id),permission:"read"});
  }
  if(p==="/v1/me/brokerage" && m==="DELETE"){
    if(!checkOrigin(req))throw failure(403,"Untrusted Origin");
    const user=await requireUser(req,ctx);
    await deletePendingBrokerage(user.id);
    return json(res,200,{disconnected:await disconnectBrokerage(user.id)});
  }
  if(p==="/v1/sources" && m==="GET")return json(res,200,{sources:sourceRegistry,disclaimer:"Sources marked disabled are not ingested or republished."});
  if(p==="/v1/status" && m==="GET"){
    const last=await query("SELECT started_at,finished_at,status,discovered,parsed,failed,skipped FROM ingest_runs ORDER BY id DESC LIMIT 1");
    const count=await query("SELECT count(*)::integer AS filings FROM sec_filings WHERE ingest_status='parsed'");
    return json(res,200,{engine:"online",sec:secReady()?"configured":"requires_user_agent",filings:count.rows[0]?.filings||0,lastIngest:last.rows[0]||null,paid:false});
  }
  if(p==="/v1/filings" && m==="GET"){
    const limit=positive(u.searchParams.get("limit"),30,100);
    const search=(u.searchParams.get("q")||"").trim().slice(0,100);
    const t=u.searchParams.has("ticker")?ticker(u.searchParams.get("ticker")):null;
    const offset=Math.min(1000,Math.max(0,Number(u.searchParams.get("offset"))||0));
    const rows=await query(`SELECT accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,period_of_report,
      is_amendment,source_url,xml_url,owner_names,retrieved_at
      FROM sec_filings WHERE ingest_status='parsed'
      AND ($1::text IS NULL OR ticker=$1) AND ($2::text = '' OR issuer_name ILIKE '%'||$2||'%' OR title ILIKE '%'||$2||'%')
      ORDER BY published_at DESC NULLS LAST,accession DESC LIMIT $3 OFFSET $4`,[t,search,limit,offset]);
    return json(res,200,{items:rows.rows,limit,offset,source:"SEC EDGAR",note:"Publication is not transaction time."});
  }
  if(p.startsWith("/v1/filings/") && m==="GET"){
    const accession=p.slice("/v1/filings/".length);
    if(!/^\d{18}$/.test(accession))throw failure(400,"Invalid accession");
    const f=await query("SELECT * FROM sec_filings WHERE accession=$1 AND ingest_status='parsed'",[accession]);
    if(!f.rows.length)throw failure(404,"Filing not found");
    const transactions=await query("SELECT * FROM sec_transactions WHERE accession=$1 ORDER BY id",[accession]);
    await withJointOwners(transactions.rows,query,await hasFilingOwners(query));
    return json(res,200,{filing:f.rows[0],transactions:transactions.rows,note:"A Form 4 may include sales, grants, option exercises, and amendments; inspect transaction codes."});
  }
  if(p==="/v1/transactions" && m==="GET"){
    const limit=positive(u.searchParams.get("limit"),30,100), offset=Math.min(1000,Math.max(0,Number(u.searchParams.get("offset"))||0));
    const t=u.searchParams.has("ticker")?ticker(u.searchParams.get("ticker")):null;
    const category=u.searchParams.get("category")||null;
    if(category && !["reported_purchase","reported_sale","other"].includes(category))throw failure(400,"Invalid category");
    const rows=await query(`SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM sec_transactions t
      JOIN sec_filings f ON f.accession=t.accession
      WHERE f.ingest_status='parsed' AND ($1::text IS NULL OR t.ticker=$1) AND ($2::text IS NULL OR t.category=$2)
      ORDER BY t.transaction_date DESC NULLS LAST,f.published_at DESC LIMIT $3 OFFSET $4`,[t,category,limit,offset]);
    await withJointOwners(rows.rows,query,await hasFilingOwners(query));
    return json(res,200,{items:rows.rows,limit,offset,source:"SEC Form 4",disclaimer:"Reported purchases and sales are not recommendations or predictive signals."});
  }
  if(p==="/v1/companies" && m==="GET"){
    const search=(u.searchParams.get("q")||"").trim().slice(0,60);
    const rows=await query(`SELECT DISTINCT ON (issuer_cik) issuer_cik,issuer_name,ticker,published_at
      FROM sec_filings WHERE ingest_status='parsed' AND issuer_cik IS NOT NULL
      AND ($1::text = '' OR ticker ILIKE $1||'%' OR issuer_name ILIKE '%'||$1||'%')
      ORDER BY issuer_cik,published_at DESC NULLS LAST LIMIT 100`,[search]);
    return json(res,200,{items:rows.rows});
  }
  if(p==="/v1/clusters" && m==="GET"){
    const days=positive(u.searchParams.get("days"),7,30),minOwners=positive(u.searchParams.get("minOwners"),2,10);
    if(minOwners<2)throw failure(400,"minOwners >= 2 required");
    const rows=await query(`SELECT issuer_cik,ticker,owner_cik,category,derivative,transaction_date,estimated_value,source_url
      FROM sec_transactions WHERE transaction_date >= (current_date-$1::integer)
      AND category='reported_purchase' AND NOT derivative AND owner_cik IS NOT NULL`,[days]);
    const data=rows.rows.map(r=>({issuerCik:r.issuer_cik,ticker:r.ticker,ownerCik:r.owner_cik,
      category:r.category,derivative:r.derivative,transactionDate:r.transaction_date?.toISOString().slice(0,10),
      estimatedValue:r.estimated_value===null?null:Number(r.estimated_value),sourceUrl:r.source_url}));
    return json(res,200,{days,minOwners,items:clusterPurchases(data,{days,minOwners}),
      methodology:"Grouping distinct reporting-owner CIKs with Form 4 non-derivative P/A transactions by issuer and report transaction date. Amended reports may duplicate original events; interpret cautiously.",
      disclaimer:"No forecast or buy/sell recommendation."});
  }
  if(p==="/v1/insiders" && m==="GET"){
    const q=(u.searchParams.get("q")||"").trim().slice(0,80);
    const sql=(await hasFilingOwners(ctx.query))?INSIDERS_SQL.joint:INSIDERS_SQL.single;
    const rows=await ctx.query(sql,[q]);
    return json(res,200,{items:rows.rows,source:"SEC Form 4"});
  }
  if(p==="/v1/me" && m==="GET"){
    const user=await requireUser(req,ctx);
    return json(res,200,{user:publicUser(user),access:accessSummary(user,ctx.env)});
  }
  if(p==="/v1/me/manual-holdings" && m==="GET"){
    const user=await requireUser(req,ctx);
    const holdings=await ctx.query("SELECT ticker,quantity,updated_at FROM manual_holdings WHERE user_id=$1 ORDER BY ticker LIMIT 100",[user.id]);
    const tickers=holdings.rows.map(row=>row.ticker);
    let secItems=[];
    if(tickers.length){
      const records=await ctx.query(`SELECT DISTINCT ON(t.ticker) t.ticker,t.accession,t.issuer_cik,t.owner_cik,t.owner_name,t.category,t.transaction_date,
        t.source_url,f.published_at
        FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
        WHERE t.ticker=ANY($1::text[]) AND f.ingest_status='parsed'
          AND f.published_at>=now()-interval '30 days'
        ORDER BY t.ticker,f.published_at DESC,t.transaction_date DESC NULLS LAST`,[tickers]);
      // A joint line names every reporting owner (owners: [{cik, name}]), so each one links to their file.
      secItems=await withJointOwners(records.rows,ctx.query,await hasFilingOwners(ctx.query));
    }
    return json(res,200,{items:holdings.rows,recentSecActivity:secItems,source:"user-entered",
      disclaimer:"Self-reported quantities, not broker-verified positions or live prices. SEC ticker matching does not constitute investment advice."});
  }
  if(p==="/v1/me/people" && m==="GET"){
    const user=await requireUser(req,ctx);
    const sql=(await hasFilingOwners(ctx.query))?FOLLOW_SQL.joint:FOLLOW_SQL.single;
    const results=await ctx.query(sql.list,[user.id]);
    return json(res,200,{items:results.rows,source:"SEC Form 4"});
  }
  // Must stay ahead of the DELETE /v1/me/people/:cik prefix route (GET only, exact path).
  if(p==="/v1/me/people/updates" && m==="GET"){
    const user=await requireUser(req,ctx);
    const limit=positive((u.searchParams.get("limit")||"").trim()||null,40,100);
    return json(res,200,await followedPeopleUpdates(user.id,limit,ctx.query));
  }
  if(p==="/v1/me/watchlist" && m==="GET"){
    const user=await requireUser(req,ctx);
    const w=await query("SELECT ticker,created_at FROM watchlist WHERE user_id=$1 ORDER BY ticker",[user.id]);
    return json(res,200,{items:w.rows});
  }
  if(p==="/v1/me/research-decisions" && m==="GET"){
    const user=await requireUser(req,ctx);
    const t=u.searchParams.has("ticker")?ticker(u.searchParams.get("ticker")):null;
    const saved=await query(`SELECT ticker,review_status,notes,created_at,updated_at
      FROM research_decisions WHERE user_id=$1 AND ($2::text IS NULL OR ticker=$2)
      ORDER BY updated_at DESC LIMIT 100`,[user.id,t]);
    return json(res,200,{items:saved.rows,note:"Private research notes only. No orders or trade instructions are sent."});
  }
  if(p==="/v1/me/alerts" && m==="GET"){
    const user=await requireUser(req,ctx);
    const results=await ctx.query(`SELECT t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.category,t.estimated_value,t.source_url,f.published_at
      FROM sec_transactions t JOIN watchlist w ON w.ticker=t.ticker
      JOIN sec_filings f ON f.accession=t.accession WHERE w.user_id=$1 AND f.published_at>=now()-interval '30 days'
      ORDER BY f.published_at DESC LIMIT 100`,[user.id]);
    await withJointOwners(results.rows,ctx.query,await hasFilingOwners(ctx.query));
    return json(res,200,{items:results.rows,delivery:"in_app_on_demand",note:"No email or push notifications are active."});
  }
  if(p==="/v1/internal/ingest" && m==="POST"){
    if(!config.ingestSecret || !req.headers.authorization?.startsWith("Bearer "))throw failure(401,"Authorized ingestion token required");
    const submitted=req.headers.authorization.slice(7);
    const a=Buffer.from(submitted),b=Buffer.from(config.ingestSecret);
    if(a.length!==b.length || !timingSafeEqual(a,b))throw failure(401,"Unauthorized ingestion");
    const result=await ingest();
    return json(res,result.ok?200:409,result);
  }
  if(m==="POST"||m==="DELETE"){
    if(!checkOrigin(req))throw failure(403,"Untrusted Origin");
    // Behind the hosting proxy the socket address is the proxy's; clientAddress reads the real client.
    const ip=clientAddress(req);
    if(p==="/v1/auth/register" && m==="POST"){
      if(isLimited("signup:"+ip,8))throw failure(429,"Too many registration attempts");
      const x=await body(req),r=await register(x.email,x.password);
      return json(res,201,{user:r.user,access:accessSummary(r.account,ctx.env)}, {"Set-Cookie":sessionCookie(r.token)});
    }
    if(p==="/v1/auth/login" && m==="POST"){
      const x=await body(req),who=typeof x?.email==="string"?x.email.trim().toLowerCase().slice(0,320):"";
      // Only failed attempts count: per client address and per account, so one network cannot lock everyone out
      // and nobody can guess at one account from many addresses.
      if(atLimit("login-ip:"+ip,30) || (who && atLimit("login-email:"+who,10)))throw failure(429,"Too many failed sign-in attempts. Wait 15 minutes and try again.");
      let r;
      try{r=await login(x.email,x.password)}
      catch(e){if(e?.status===401){countFailure("login-ip:"+ip);if(who)countFailure("login-email:"+who)}throw e}
      return json(res,200,{user:r.user,access:accessSummary(r.account,ctx.env)},{"Set-Cookie":sessionCookie(r.token)});
    }
    if(p==="/v1/auth/logout" && m==="POST"){
      await revokeSession(req);return json(res,200,{ok:true},{"Set-Cookie":clearCookie()});
    }
    if(p==="/v1/me" && m==="DELETE"){
      const user=await requireUser(req,ctx);
      if(isLimited("delete-account:"+user.id,6,15*60*1000))throw failure(429,"Too many attempts. Try again shortly.");
      // Deleting an account needs the account's password as well as the session, so a borrowed or stolen session cannot do it.
      const confirm=await body(req);
      if(!await passwordMatches(user.id,confirm?.password))throw failure(403,"That password is not correct, so nothing was deleted.");
      // Cancel a live Stripe subscription FIRST (nothing is deleted if Stripe cannot confirm it),
      // then revoke an active brokerage grant, then remove the account and its data.
      const result=await deleteAccount(user,{query,stripe:ctx.stripe||createStripeClient({secretKey:billingSettings(ctx.env).secretKey}),
        revokeBrokerage:disconnectBrokerage});
      return json(res,200,result,{"Set-Cookie":clearCookie()});
    }
    if(p==="/v1/me/research-decisions" && m==="POST"){
      const user=await requireUser(req,ctx),x=await body(req);
      if(!x || typeof x!=="object" || Array.isArray(x))throw failure(400,"Invalid review");
      const t=ticker(x.ticker),review=validateResearchDecision(x);
      const saved=await query(`INSERT INTO research_decisions(user_id,ticker,review_status,notes)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id,ticker) DO UPDATE SET review_status=EXCLUDED.review_status,
        notes=EXCLUDED.notes,updated_at=now()
        RETURNING ticker,review_status,notes,created_at,updated_at`,
        [user.id,t,review.reviewStatus,review.notes]);
      return json(res,200,{item:saved.rows[0],executed:false});
    }
    if(p==="/v1/me/research-decisions" && m==="DELETE"){
      const user=await requireUser(req,ctx),t=ticker(u.searchParams.get("ticker"));
      const deleted=await query("DELETE FROM research_decisions WHERE user_id=$1 AND ticker=$2 RETURNING ticker",[user.id,t]);
      return json(res,200,{deleted:deleted.rowCount>0,ticker:t});
    }
    if(p==="/v1/me/manual-holdings" && m==="POST"){
      const user=await requireUser(req,ctx);
      if(isLimited("holding-write:"+user.id,40,15*60*1000))throw failure(429,"Too many holding updates");
      const item=validateManualHolding(await body(req));
      const record=await query(`INSERT INTO manual_holdings(user_id,ticker,quantity)
        SELECT $1,$2,$3 WHERE
        (SELECT count(*) FROM manual_holdings WHERE user_id=$1)<100
        OR EXISTS(SELECT 1 FROM manual_holdings WHERE user_id=$1 AND ticker=$2)
        ON CONFLICT(user_id,ticker) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()
        RETURNING ticker,quantity,updated_at`,[user.id,item.ticker,item.quantity]);
      if(!record.rowCount)throw failure(409,"100 holdings maximum");
      return json(res,200,{item:record.rows[0],source:"user-entered",executed:false});
    }
    if(p.startsWith("/v1/me/manual-holdings/") && m==="DELETE"){
      const user=await requireUser(req,ctx),t=ticker(p.slice("/v1/me/manual-holdings/".length));
      const deleted=await query("DELETE FROM manual_holdings WHERE user_id=$1 AND ticker=$2 RETURNING ticker",[user.id,t]);
      return json(res,200,{deleted:deleted.rowCount>0,ticker:t,executed:false});
    }
    if(p==="/v1/me/people" && m==="POST"){
      const user=await requireUser(req,ctx);
      if(isLimited("follow-write:"+user.id,60,15*60*1000))throw failure(429,"Too many follow updates");
      const x=await body(req),cik=canonicalOwnerCik(x?.owner_cik);
      if(!cik)throw failure(400,"Valid reporting-person SEC CIK required");
      const sql=(await hasFilingOwners(ctx.query))?FOLLOW_SQL.joint:FOLLOW_SQL.single;
      const person=await ctx.query(sql.known,[[cik.replace(/^0+/,""),cik]]);
      if(!person.rowCount)throw failure(404,"Reporting person not found in imported SEC records");
      const saved=await ctx.query(FOLLOW_INSERT_SQL,[user.id,cik]);
      if(!saved.rowCount)throw failure(409,`${MAX_FOLLOWS} people maximum; unfollow someone first`);
      return json(res,200,{saved:true,owner_cik:saved.rows[0]?.owner_cik??cik});
    }
    if(p.startsWith("/v1/me/people/") && m==="DELETE"){
      const user=await requireUser(req,ctx),cik=decodeURIComponent(p.slice("/v1/me/people/".length));
      if(!/^\d{1,12}$/.test(cik))throw failure(400,"Invalid SEC reporting-person CIK");
      // Every stored form of this person goes ("1214156" and "0001214156" are one follow).
      await ctx.query(FOLLOW_DELETE_SQL,[user.id,cik]);
      return json(res,200,{deleted:true,owner_cik:cik});
    }
    if(p==="/v1/me/watchlist" && m==="POST"){
      const user=await requireUser(req,ctx),x=await body(req),t=ticker(x.ticker);
      await query("INSERT INTO watchlist(user_id,ticker) VALUES($1,$2) ON CONFLICT DO NOTHING",[user.id,t]);
      return json(res,200,{saved:true,ticker:t});
    }
    if(p.startsWith("/v1/me/watchlist/") && m==="DELETE"){
      const user=await requireUser(req,ctx),t=ticker(decodeURIComponent(p.split("/").at(-1)));
      await query("DELETE FROM watchlist WHERE user_id=$1 AND ticker=$2",[user.id,t]);
      return json(res,200,{deleted:true,ticker:t});
    }
  }
  throw failure(404,"Route not found");
}
/* options (for tests): currentUser(req) → account row or null, env (paywall/billing
 * settings, default process.env), stripe (a createStripeClient()-shaped client),
 * query(sql, params) (default the PostgreSQL pool; used by the followed-people routes), quiet. */
export function createApiServer(options={}){
  const ctx={currentUser:options.currentUser||currentUser,env:options.env||process.env,stripe:options.stripe||null,query:options.query||query};
  if(!options.quiet)for(const notice of paywallNotices(ctx.env))console.warn("Paywall:",notice);
  return createServer((req,res)=>{route(req,res,ctx).catch(error=>{
    // A database that can't be reached is an outage, not a bug: answer 503 with a retry hint instead of 500.
    const dbDown=!error?.status&&(/^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|57P0[1-3]|08\d\d\d|53300)$/.test(String(error?.code||""))||/Connection terminated|timeout exceeded when trying to connect/i.test(String(error?.message||"")));
    if(dbDown){console.error("API database unavailable",error?.code||error?.message);if(!res.headersSent)return json(res,503,{error:"Insidir is temporarily unavailable. Try again shortly."},{"Retry-After":"30"});return res.end();}
    const status=Number(error?.status)||500;
    // 503s carry deliberate, user-safe service messages (e.g. SEC data temporarily unavailable).
    if(status>=500&&status!==503)console.error("API error",error);
    if(!res.headersSent)json(res,status,{error:status>=500&&status!==503?"Internal error":String(error.message||"Bad request")});
    else res.end();
  })});
}

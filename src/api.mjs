import { createServer } from "node:http";
import { randomBytes,timingSafeEqual } from "node:crypto";
import { config,secReady } from "./config.mjs";
import { query,health } from "./db.mjs";
import { ingest } from "./ingest.mjs";
import { sourceRegistry,clusterPurchases } from "./analysis.mjs";
import { currentUser,register,login,revokeSession,sessionCookie,clearCookie,checkOrigin } from "./auth.mjs";
import { serveStatic } from "./web.mjs";
import { billingRoutes,createStripeClient,deleteAccount } from "./billing.mjs";
import { gate,accessSummary,paywallNotices,privateCacheControl,mergeVary,unavailablePage } from "./paywall.mjs";
import { billingSettings } from "./config.mjs";
import { validateResearchDecision } from "./research.mjs";
import { handleCompanyRoute } from "./company-routes.mjs";
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
      ORDER BY f.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST LIMIT 30`,[t]).catch(()=>({rows:[]}))).rows});
    if(handled!==false)return;
  }
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
    return json(res,200,{filing:f.rows[0],transactions:transactions.rows,note:"A Form 4 may include sales, grants, option exercises, and amendments; inspect transaction codes."});
  }
  if(p==="/v1/transactions" && m==="GET"){
    const limit=positive(u.searchParams.get("limit"),30,100), offset=Math.min(1000,Math.max(0,Number(u.searchParams.get("offset"))||0));
    const t=u.searchParams.has("ticker")?ticker(u.searchParams.get("ticker")):null;
    const category=u.searchParams.get("category")||null;
    if(category && !["reported_purchase","reported_sale","other"].includes(category))throw failure(400,"Invalid category");
    const rows=await query(`SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM sec_transactions t
      JOIN sec_filings f ON f.accession=t.accession
      WHERE ($1::text IS NULL OR t.ticker=$1) AND ($2::text IS NULL OR t.category=$2)
      ORDER BY t.transaction_date DESC NULLS LAST,f.published_at DESC LIMIT $3 OFFSET $4`,[t,category,limit,offset]);
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
    const rows=await query(`SELECT owner_cik,
      (ARRAY_AGG(owner_name ORDER BY transaction_date DESC NULLS LAST))[1] AS owner_name,
      (ARRAY_AGG(ticker ORDER BY transaction_date DESC NULLS LAST))[1] AS ticker,
      COUNT(DISTINCT accession)::integer AS filings,
      MAX(transaction_date) AS last_transaction_date FROM sec_transactions
      WHERE owner_cik IS NOT NULL AND ($1::text='' OR owner_name ILIKE '%'||$1||'%')
      GROUP BY owner_cik ORDER BY last_transaction_date DESC NULLS LAST LIMIT 100`,[q]);
    return json(res,200,{items:rows.rows,source:"SEC Form 4"});
  }
  if(p==="/v1/me" && m==="GET"){
    const user=await requireUser(req,ctx);
    return json(res,200,{user:publicUser(user),access:accessSummary(user,ctx.env)});
  }
  if(p==="/v1/me/manual-holdings" && m==="GET"){
    const user=await requireUser(req,ctx);
    const holdings=await query("SELECT ticker,quantity,updated_at FROM manual_holdings WHERE user_id=$1 ORDER BY ticker LIMIT 100",[user.id]);
    const tickers=holdings.rows.map(row=>row.ticker);
    let secItems=[];
    if(tickers.length){
      const records=await query(`SELECT DISTINCT ON(t.ticker) t.ticker,t.owner_name,t.category,t.transaction_date,
        t.source_url,f.published_at
        FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
        WHERE t.ticker=ANY($1::text[]) AND f.ingest_status='parsed'
          AND f.published_at>=now()-interval '30 days'
        ORDER BY t.ticker,f.published_at DESC,t.transaction_date DESC NULLS LAST`,[tickers]);
      secItems=records.rows;
    }
    return json(res,200,{items:holdings.rows,recentSecActivity:secItems,source:"user-entered",
      disclaimer:"Self-reported quantities, not broker-verified positions or live prices. SEC ticker matching does not constitute investment advice."});
  }
  if(p==="/v1/me/people" && m==="GET"){
    const user=await requireUser(req,ctx);
    const results=await query(`SELECT fp.owner_cik,fp.created_at,
      (SELECT owner_name FROM sec_transactions WHERE owner_cik=fp.owner_cik ORDER BY transaction_date DESC NULLS LAST LIMIT 1) AS owner_name,
      (SELECT ticker FROM sec_transactions WHERE owner_cik=fp.owner_cik ORDER BY transaction_date DESC NULLS LAST LIMIT 1) AS ticker,
      (SELECT MAX(transaction_date) FROM sec_transactions WHERE owner_cik=fp.owner_cik) AS last_transaction_date
      FROM followed_people fp WHERE fp.user_id=$1 ORDER BY fp.created_at DESC LIMIT 150`,[user.id]);
    return json(res,200,{items:results.rows,source:"SEC Form 4"});
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
    const results=await query(`SELECT t.id,t.ticker,t.owner_name,t.transaction_date,t.category,t.estimated_value,t.source_url,f.published_at
      FROM sec_transactions t JOIN watchlist w ON w.ticker=t.ticker
      JOIN sec_filings f ON f.accession=t.accession WHERE w.user_id=$1 AND f.published_at>=now()-interval '30 days'
      ORDER BY f.published_at DESC LIMIT 100`,[user.id]);
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
    const ip=req.socket.remoteAddress||"unknown";
    if(p==="/v1/auth/register" && m==="POST"){
      if(isLimited("signup:"+ip,8))throw failure(429,"Too many registration attempts");
      const x=await body(req),r=await register(x.email,x.password);
      return json(res,201,{user:r.user,access:accessSummary(r.account,ctx.env)}, {"Set-Cookie":sessionCookie(r.token)});
    }
    if(p==="/v1/auth/login" && m==="POST"){
      if(isLimited("login:"+ip,12))throw failure(429,"Too many login attempts");
      const x=await body(req),r=await login(x.email,x.password);
      return json(res,200,{user:r.user,access:accessSummary(r.account,ctx.env)},{"Set-Cookie":sessionCookie(r.token)});
    }
    if(p==="/v1/auth/logout" && m==="POST"){
      await revokeSession(req);return json(res,200,{ok:true},{"Set-Cookie":clearCookie()});
    }
    if(p==="/v1/me" && m==="DELETE"){
      const user=await requireUser(req,ctx);
      if(isLimited("delete-account:"+user.id,6,15*60*1000))throw failure(429,"Too many attempts. Try again shortly.");
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
      const user=await requireUser(req,ctx),x=await body(req),cik=String(x.owner_cik??"").trim();
      if(!/^\d{1,12}$/.test(cik))throw failure(400,"Valid reporting-person SEC CIK required");
      const person=await query("SELECT 1 FROM sec_transactions WHERE owner_cik=$1 LIMIT 1",[cik]);
      if(!person.rowCount)throw failure(404,"Reporting person not found in imported SEC records");
      await query("INSERT INTO followed_people(user_id,owner_cik) VALUES($1,$2) ON CONFLICT DO NOTHING",[user.id,cik]);
      return json(res,200,{saved:true,owner_cik:cik});
    }
    if(p.startsWith("/v1/me/people/") && m==="DELETE"){
      const user=await requireUser(req,ctx),cik=decodeURIComponent(p.slice("/v1/me/people/".length));
      if(!/^\d{1,12}$/.test(cik))throw failure(400,"Invalid SEC reporting-person CIK");
      await query("DELETE FROM followed_people WHERE user_id=$1 AND owner_cik=$2",[user.id,cik]);
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
 * settings, default process.env), stripe (a createStripeClient()-shaped client), quiet. */
export function createApiServer(options={}){
  const ctx={currentUser:options.currentUser||currentUser,env:options.env||process.env,stripe:options.stripe||null};
  if(!options.quiet)for(const notice of paywallNotices(ctx.env))console.warn("Paywall:",notice);
  return createServer((req,res)=>{route(req,res,ctx).catch(error=>{
    const status=Number(error?.status)||500;
    // 503s carry deliberate, user-safe service messages (e.g. SEC data temporarily unavailable).
    if(status>=500&&status!==503)console.error("API error",error);
    if(!res.headersSent)json(res,status,{error:status>=500&&status!==503?"Internal error":String(error.message||"Bad request")});
    else res.end();
  })});
}

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 3000);
const backend = (process.env.ENGINE_URL || "http://insidir-engine.railway.internal:8080").replace(/\/+$/, "");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};
const headers = {"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; img-src 'self' https://images.unsplash.com https://images.pexels.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
const fail = (res, code, message) => {res.writeHead(code,{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify({error:message}))};
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    if (path === "/healthz") {res.writeHead(200,{...headers,"Content-Type":"application/json"});return res.end('{"ok":true,"service":"insidir-web"}')}
    if (path.startsWith("/v1/") || path === "/api/engine-health") {
      if (!["GET","HEAD","POST","DELETE","OPTIONS"].includes(req.method)) return fail(res,405,"Method not allowed");
      const upstream = new URL(path === "/api/engine-health" ? "/healthz" : path + url.search,backend);
      if (!["http:","https:"].includes(upstream.protocol)) return fail(res,500,"Invalid engine configuration");
      const h = {};
      for (const key of ["accept","content-type","cookie","user-agent","origin","authorization"]) {
        if (req.headers[key]) h[key]=req.headers[key];
      }
      // The backend validates Origin against the known public website origin.
      const chunks = []; let bytes=0;
      for await (const chunk of req) {bytes+=chunk.length;if(bytes>32768)return fail(res,413,"Payload too large");chunks.push(chunk)}
      const ac = new AbortController(); const timer=setTimeout(()=>ac.abort(),16000);
      let reply;
      try {reply=await fetch(upstream,{method:req.method,headers:h,body:bytes?Buffer.concat(chunks):undefined,signal:ac.signal,redirect:"manual"})}
      finally {clearTimeout(timer)}
      const safe={...headers,"Cache-Control":"no-store","Content-Type":reply.headers.get("content-type")||"application/json; charset=utf-8"};
      for(const k of ["set-cookie","retry-after"]) {const v=reply.headers.get(k);if(v)safe[k]=v}
      res.writeHead(reply.status,safe);
      if(req.method==="HEAD")return res.end();
      return res.end(Buffer.from(await reply.arrayBuffer()));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res,405,"Method not allowed");
    const candidate = path === "/" ? "index.html" : path.slice(1);
    const absolute = resolve(root,candidate);
    if(!absolute.startsWith(resolve(root)+sep) && absolute!==resolve(root))return fail(res,403,"Forbidden");
    const target = extname(candidate) ? absolute : join(root,"index.html");
    let file;
    try {const s=await stat(target);if(!s.isFile())throw Error();file=await readFile(target)}
    catch {return fail(res,404,"Not found")}
    const ct=types[extname(target)] || "application/octet-stream";
    res.writeHead(200,{...headers,"Content-Type":ct,"Cache-Control":ct.startsWith("text/html")?"no-cache":"public, max-age=3600"});
    res.end(req.method==="HEAD"?undefined:file);
  } catch(e){console.error("Web request failed",e.message);if(!res.headersSent)fail(res,503,"The research engine is temporarily unavailable");else res.end()}
});
server.listen(port,"0.0.0.0",()=>console.log("Insidir web listening on",port));

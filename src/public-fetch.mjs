/* Polite fetching of companies' public web pages (homepages, leadership and board pages).
 * - https only; every request and every redirect hop goes through assertPublic() (SSRF guard).
 * - One honest User-Agent, never a browser imitation; robots.txt is obeyed for that agent.
 * - At most one request per second per host, bounded size and time.
 * - A bot wall (403 / challenge page) is recorded as "blocked" for 30 days and is never retried
 *   or worked around; a 429 backs the host off for its Retry-After.
 * Also a small tolerant HTML parser, since the server has no DOM library. */
import { assertPublic } from "./media.mjs";
import { getRecord, putRecord } from "./media-store.mjs";

export const PUBLIC_UA = "InsidirResearch/1.0 (+spartanapparelbiz@gmail.com)";
const ROBOTS_TOKEN = "insidirresearch";
const DAY = 86400000;
export const BLOCK_TTL = 30 * DAY;

/* ---------------- registrable domain ---------------- */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "ne", "or", "edu", "ltd", "plc"]);
export function registrableDomain(input) {
  let host = String(input || "").toLowerCase().trim();
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/\.$/, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return host;
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts.at(-2)) && parts.at(-1).length === 2 ? 3 : 2;
  return parts.slice(-n).join(".");
}

/* ---------------- robots.txt (RFC 9309) ---------------- */
export function parseRobots(text) {
  const groups = [];
  let current = null, lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [], delay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") { if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value }); }
    else if (key === "crawl-delay") { const d = Number(value); if (Number.isFinite(d) && d >= 0) current.delay = d; }
  }
  const mine = groups.filter(g => g.agents.some(a => a !== "*" && a && ROBOTS_TOKEN.includes(a.replace(/\/.*$/, ""))));
  const chosen = mine.length ? mine : groups.filter(g => g.agents.includes("*"));
  const rules = chosen.flatMap(g => g.rules).filter(r => r.path);
  const delays = chosen.map(g => g.delay).filter(d => d != null);
  return { rules, delay: delays.length ? Math.max(...delays) : null };
}
function ruleMatches(pattern, path) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const rx = new RegExp("^" + body.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return rx.test(path);
}
export function robotsAllows(robots, url) {
  if (!robots || !robots.rules?.length) return true;
  const u = new URL(url);
  let path = u.pathname + u.search;
  try { path = decodeURI(path); } catch { /* keep encoded */ }
  let best = null;
  for (const r of robots.rules) {
    let p = r.path;
    try { p = decodeURI(p); } catch { /* keep */ }
    if (!ruleMatches(p, path)) continue;
    const len = p.replace(/[*$]/g, "").length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

/* ---------------- bot walls ---------------- */
// "captcha" alone is not a signal: Wix and other builders mention it in ordinary pages.
const CHALLENGE = /Just a moment\.\.\.|cf-chl|challenge-platform|cf_chl_opt|Attention Required! \| Cloudflare|_Incapsula_|Incapsula incident|px-captcha|perimeterx|Pardon Our Interruption|Request unsuccessful\. Incapsula|<title>Access Denied<\/title>|Reference #\d+\.[0-9a-f]+\.\d+|Request blocked\.|The request could not be satisfied/i;
export function isChallenge(status, body, headers = {}) {
  const head = String(body || "").slice(0, 20000);
  if (status === 403 || status === 503) {
    return CHALLENGE.test(head) || /cloudflare|akamai|incapsula|imperva|sucuri|ddos-guard/i.test(String(headers.server || headers["x-cdn"] || "")) || Boolean(headers["cf-mitigated"]);
  }
  return status === 200 && head.length < 30000 && CHALLENGE.test(head);
}

/* ---------------- fetcher ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function decodeBody(bytes, contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1]?.toLowerCase();
  try { return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8", { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

/* Deps are injectable for tests: fetchImpl (fetch-compatible), check (assertPublic), store
 * ({getRecord, putRecord}), now, wait. */
export function createPublicFetcher({
  fetchImpl = (...a) => fetch(...a), check = assertPublic, store = { getRecord, putRecord },
  now = () => Date.now(), wait = sleep, minIntervalMs = 1000, timeoutMs = 15000, maxBytes = 3_000_000,
  userAgent = PUBLIC_UA, maxHops = 5
} = {}) {
  const hosts = new Map();   // host -> {tail: Promise, next: ms}
  const robots = new Map();  // host -> Promise<{rules,delay,status}>
  const stats = { requests: 0, blocked: 0, robots: 0 };
  const hostState = host => { if (!hosts.has(host)) hosts.set(host, { tail: Promise.resolve(), next: 0, delay: minIntervalMs }); return hosts.get(host); };

  /* One request at a time per host, spaced by max(1 s, robots crawl-delay capped at 10 s). */
  function paced(host, task) {
    const st = hostState(host);
    const run = st.tail.then(async () => {
      const gap = st.next - now();
      if (gap > 0) await wait(gap);
      try { return await task(); }
      finally { st.next = now() + st.delay; }
    });
    st.tail = run.catch(() => {});
    return run;
  }
  async function raw(url, accept) {
    const host = new URL(url).hostname;
    return paced(host, async () => {
      stats.requests++;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { redirect: "manual", signal: abort.signal,
          headers: { "User-Agent": userAgent, Accept: accept, "Accept-Language": "en-US,en;q=0.8" } });
        const headers = {};
        for (const [k, v] of response.headers) headers[k.toLowerCase()] = v;
        let bytes = Buffer.alloc(0);
        if (response.body && !(response.status >= 300 && response.status < 400)) {
          const declared = Number(headers["content-length"] || 0);
          const reader = response.body.getReader(), chunks = [];
          let size = 0;
          if (declared <= maxBytes * 4) {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value); size += value.length;
              if (size >= maxBytes) { await reader.cancel().catch(() => {}); break; } // keep the head of oversized pages
            }
          } else await reader.cancel().catch(() => {});
          bytes = Buffer.concat(chunks).subarray(0, maxBytes);
        } else await response.body?.cancel?.().catch(() => {});
        return { status: response.status, headers, bytes };
      } finally { clearTimeout(timer); }
    });
  }
  async function blockedHost(host) {
    try { return await store.getRecord("site-block", host); } catch { return null; }
  }
  async function markBlocked(host, value, ttl) {
    stats.blocked++;
    try { await store.putRecord("site-block", host, { ...value, at: new Date(now()).toISOString() }, ttl); } catch { /* memory only */ }
  }
  async function robotsFor(origin) {
    const host = new URL(origin).hostname;
    if (!robots.has(host)) {
      robots.set(host, (async () => {
        const saved = await store.getRecord("robots", host).catch(() => null);
        if (saved) return saved;
        let result;
        try {
          await check(origin + "/robots.txt");
          const r = await raw(origin + "/robots.txt", "text/plain,*/*;q=0.5");
          if (r.status >= 200 && r.status < 300) result = { ...parseRobots(decodeBody(r.bytes, r.headers["content-type"])), status: r.status };
          else if (r.status >= 300 && r.status < 400) result = { rules: [], delay: null, status: r.status }; // redirected robots: treat as none
          // Only a challenge page counts as a wall here: S3/CloudFront answer a missing robots.txt with a plain 403.
          else if (CHALLENGE.test(decodeBody(r.bytes).slice(0, 20000))) result = { rules: [], delay: null, status: r.status, challenge: true };
          else if (r.status >= 400 && r.status < 500) result = { rules: [], delay: null, status: r.status };
          else result = { rules: [{ allow: false, path: "/" }], delay: null, status: r.status, unavailable: true }; // 5xx: assume full disallow
        } catch (e) {
          result = { rules: [{ allow: false, path: "/" }], delay: null, status: 0, unavailable: true, error: String(e?.message || e).slice(0, 80) };
        }
        if (result.delay != null) hostState(host).delay = Math.max(minIntervalMs, Math.min(10, result.delay) * 1000);
        if (!result.unavailable) await store.putRecord("robots", host, result, DAY).catch(() => {});
        return result;
      })());
    }
    return robots.get(host);
  }

  /* -> {status:'ok', url, html} | {status:'blocked'|'robots'|'unreachable'|'http'|'not-html'|'error', url, code?} */
  async function page(url, { accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", wantText = false } = {}) {
    let current = url;
    for (let hop = 0; hop <= maxHops; hop++) {
      let u;
      try { u = new URL(current); } catch { return { status: "error", url: current, reason: "bad-url" }; }
      if (u.protocol !== "https:") return { status: "error", url: current, reason: "not-https" };
      try { await check(u.href); } catch (e) { return { status: "unreachable", url: current, reason: String(e?.code || e?.message || e).slice(0, 80) }; }
      const block = await blockedHost(u.hostname);
      if (block) return { status: block.rateLimited ? "rate-limited" : "blocked", url: current, code: block.code, cached: true };
      const rb = await robotsFor(u.origin);
      if (rb.challenge) { await markBlocked(u.hostname, { code: rb.status, reason: "challenge on robots.txt" }, BLOCK_TTL); return { status: "blocked", url: current, code: rb.status }; }
      if (rb.unavailable) return { status: "unreachable", url: current, reason: "robots.txt unavailable" };
      if (!robotsAllows(rb, u.href)) { stats.robots++; return { status: "robots", url: current }; }
      let r;
      try { r = await raw(u.href, accept); }
      catch (e) { return { status: "unreachable", url: current, reason: String(e?.name === "AbortError" ? "timeout" : e?.cause?.code || e?.message || e).slice(0, 80) }; }
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        try { current = new URL(r.headers.location, u.href).href; } catch { return { status: "error", url: current, reason: "bad-redirect" }; }
        continue;
      }
      const body = decodeBody(r.bytes, r.headers["content-type"]);
      if (r.status === 429) {
        const after = Number(r.headers["retry-after"]);
        await markBlocked(u.hostname, { code: 429, rateLimited: true }, Math.min(DAY, (Number.isFinite(after) && after > 0 ? after : 3600) * 1000));
        return { status: "rate-limited", url: current, code: 429 };
      }
      if (isChallenge(r.status, body, r.headers)) {
        await markBlocked(u.hostname, { code: r.status, reason: "bot wall" }, BLOCK_TTL);
        return { status: "blocked", url: current, code: r.status };
      }
      if (r.status < 200 || r.status >= 300) return { status: "http", url: current, code: r.status };
      const type = String(r.headers["content-type"] || "").toLowerCase();
      if (!wantText && type && !/html|xml/.test(type)) return { status: "not-html", url: current, code: r.status };
      return { status: "ok", url: current, code: r.status, html: body, contentType: type };
    }
    return { status: "error", url: current, reason: "too-many-redirects" };
  }
  /* Robots + pacing gate for non-HTML fetches (images) done by other helpers. */
  async function gate(url) {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (await blockedHost(u.hostname)) return false;
    const rb = await robotsFor(u.origin);
    if (rb.unavailable || rb.challenge || !robotsAllows(rb, u.href)) return false;
    return true;
  }
  return { page, gate, paced: (url, task) => paced(new URL(url).hostname, task), stats, userAgent };
}

let shared = null;
export function publicFetcher() { return shared || (shared = createPublicFetcher()); }

/* ---------------- tolerant HTML parsing ---------------- */
const VOID = new Set("area base br col embed hr img input link meta param source track wbr keygen".split(" "));
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "noscript", "iframe", "xmp", "noembed", "noframes"]);
const CLOSES_P = new Set("address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul".split(" "));
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•", eacute: "é", egrave: "è", aacute: "á", agrave: "à", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", ccedil: "ç", ouml: "ö", uuml: "ü", auml: "ä", euml: "ë", iuml: "ï", acirc: "â", ecirc: "ê", ocirc: "ô", oslash: "ø", aring: "å",
  szlig: "ß", Eacute: "É", Aacute: "Á", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Ouml: "Ö", Uuml: "Ü", Auml: "Ä", atilde: "ã", otilde: "õ", shy: "", zwnj: "", zwj: "",
  ensp: " ", emsp: " ", thinsp: " ", lrm: "", rlm: "", laquo: "«", raquo: "»", sect: "§", deg: "°", plusmn: "±", times: "×", frasl: "/", colon: ":", comma: ",", period: ".", sol: "/", lpar: "(", rpar: ")" };
export function decodeEntities(s) {
  if (!s || s.indexOf("&") < 0) return s || "";
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
  });
}
function el(tag, attrs, parent) { return { tag, attrs, children: [], parent }; }

export function parseHtml(html) {
  const src = String(html || "");
  const root = el("#root", {}, null);
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const addText = t => { if (t) top().children.push({ text: decodeEntities(t), parent: top() }); };
  const popTo = i => { stack.length = i; };
  const findOpen = (name, stopAt) => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === name) return i;
      if (stopAt && stopAt.has(stack[i].tag)) return -1;
    }
    return -1;
  };
  const LIST_SCOPE = new Set(["ul", "ol", "table"]), DL_SCOPE = new Set(["dl"]), TABLE_SCOPE = new Set(["table"]);
  let i = 0;
  const n = src.length;
  const tagStart = /<([a-zA-Z][a-zA-Z0-9:_-]*)/y, endTag = /<\/([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*>/y;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { addText(src.slice(i)); break; }
    if (lt > i) addText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) { const e = src.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue; }
    const c1 = src[lt + 1];
    if (c1 === "!" || c1 === "?") { const e = src.indexOf(">", lt); i = e < 0 ? n : e + 1; continue; }
    if (c1 === "/") {
      endTag.lastIndex = lt;
      const m = endTag.exec(src);
      if (!m) { addText("<"); i = lt + 1; continue; }
      const name = m[1].toLowerCase();
      const at = findOpen(name);
      if (at > 0) popTo(at);
      i = endTag.lastIndex;
      continue;
    }
    tagStart.lastIndex = lt;
    const m = tagStart.exec(src);
    if (!m) { addText("<"); i = lt + 1; continue; }
    const name = m[1].toLowerCase();
    // attributes
    let j = tagStart.lastIndex;
    const attrs = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /[\s/]/.test(src[j])) { if (src[j] === "/" && src[j + 1] === ">") selfClose = true; j++; }
      if (j >= n || src[j] === ">") break;
      let k = j;
      while (k < n && !/[\s/>=]/.test(src[k])) k++;
      const an = src.slice(j, k).toLowerCase();
      j = k;
      while (j < n && /\s/.test(src[j])) j++;
      let value = "";
      if (src[j] === "=") {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); value = src.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { let e = j; while (e < n && !/[\s>]/.test(src[e])) e++; value = src.slice(j, e); j = e; }
      }
      if (an && !Object.hasOwn(attrs, an)) attrs[an] = decodeEntities(value);
      if (k === j && !an) j++; // safety: never stall
    }
    i = j < n ? j + 1 : n;
    // implied end tags
    const cur = top().tag;
    if (CLOSES_P.has(name) && cur === "p") stack.pop();
    if (name === "li") { const at = findOpen("li", LIST_SCOPE); if (at > 0) popTo(at); }
    if (name === "dt" || name === "dd") { const at = Math.max(findOpen("dt", DL_SCOPE), findOpen("dd", DL_SCOPE)); if (at > 0) popTo(at); }
    if (name === "tr") { const at = findOpen("tr", TABLE_SCOPE); if (at > 0) popTo(at); }
    if (name === "td" || name === "th") { const at = Math.max(findOpen("td", TABLE_SCOPE), findOpen("th", TABLE_SCOPE)); if (at > 0) popTo(at); }
    if (name === "option") { const at = findOpen("option"); if (at > 0 && at === stack.length - 1) stack.pop(); }
    const node = el(name, attrs, top());
    top().children.push(node);
    if (RAW_TEXT.has(name)) {
      const close = new RegExp("</" + name + "\\s*>", "ig");
      close.lastIndex = i;
      const e = close.exec(src);
      const body = src.slice(i, e ? e.index : n);
      if (name === "title" || name === "textarea") node.children.push({ text: decodeEntities(body), parent: node });
      else node.raw = body;
      i = e ? close.lastIndex : n;
      continue;
    }
    if (VOID.has(name) || selfClose) continue;
    stack.push(node);
  }
  return root;
}

/* Element traversal helpers (document order, iterative). */
export function* elements(node) {
  const todo = [...(node.children || [])].reverse();
  while (todo.length) {
    const x = todo.pop();
    if (!x.tag) continue;
    yield x;
    for (let k = x.children.length - 1; k >= 0; k--) todo.push(x.children[k]);
  }
}
const HIDDEN = new Set(["script", "style", "noscript", "template", "iframe", "svg"]);
/* Visible text strings, trimmed, in order (like BeautifulSoup's stripped_strings). */
export function textStrings(node, limit = Infinity) {
  const out = [];
  const todo = [node];
  while (todo.length && out.length < limit) {
    const x = todo.pop();
    if (x.text != null) { const t = x.text.replace(/\s+/g, " ").trim(); if (t) out.push(t); continue; }
    if (x !== node && HIDDEN.has(x.tag)) continue;
    for (let k = x.children.length - 1; k >= 0; k--) todo.push(x.children[k]);
  }
  return out;
}
export const textOf = node => textStrings(node).join(" ");
export function findAll(node, pred) { const out = []; for (const e of elements(node)) if (pred(e)) out.push(e); return out; }
export function findFirst(node, pred) { for (const e of elements(node)) if (pred(e)) return e; return null; }
export function ancestors(node) { const out = []; for (let p = node.parent; p && p.tag !== "#root"; p = p.parent) out.push(p); return out; }
export const classList = node => String(node?.attrs?.class || "").split(/\s+/).filter(Boolean);

/* Basic page facts used by several modules. */
export function pageMeta(root, baseUrl) {
  const meta = {};
  let base = baseUrl;
  for (const e of elements(root)) {
    if (e.tag === "base" && e.attrs.href && base === baseUrl) { try { base = new URL(e.attrs.href, baseUrl).href; } catch { /* ignore */ } }
    if (e.tag === "title" && meta.title == null) meta.title = textOf(e).slice(0, 300);
    if (e.tag === "meta") {
      const key = String(e.attrs.property || e.attrs.name || "").toLowerCase();
      if (["og:site_name", "og:title", "og:image", "application-name", "twitter:image"].includes(key) && e.attrs.content && meta[key] == null) meta[key] = e.attrs.content.trim().slice(0, 500);
    }
    if (e.tag === "h1" && meta.h1 == null) meta.h1 = textOf(e).slice(0, 200);
  }
  meta.base = base;
  return meta;
}
/* All JSON-LD objects on the page, flattened (including @graph members). */
export function jsonLd(root) {
  const out = [];
  for (const e of elements(root)) {
    if (e.tag !== "script" || !/ld\+json/i.test(e.attrs.type || "")) continue;
    let data;
    try { data = JSON.parse(String(e.raw || "").trim().replace(/^<!--|-->$/g, "")); } catch { continue; }
    const todo = [data];
    let guard = 0;
    while (todo.length && guard++ < 5000) {
      const o = todo.pop();
      if (Array.isArray(o)) { todo.push(...o); continue; }
      if (!o || typeof o !== "object") continue;
      out.push(o);
      for (const v of Object.values(o)) if (v && typeof v === "object") todo.push(v);
    }
  }
  return out;
}
export const ldTypes = o => (Array.isArray(o?.["@type"]) ? o["@type"] : [o?.["@type"]]).map(t => String(t || ""));
export function ldUrl(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldUrl(v[0]);
  if (typeof v === "object") return ldUrl(v.url || v.contentUrl || v["@id"]);
  return null;
}
export function absoluteUrl(href, base) {
  if (!href || typeof href !== "string") return null;
  const h = href.trim();
  if (!h || /^(data|javascript|mailto|tel|blob):/i.test(h)) return null;
  try { const u = new URL(h.replace(/\\\//g, "/"), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, gzip, constants as zlib } from "node:zlib";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Static delivery for the Insidir website in /web. Used by the API server for
// every non-API path and by `npm run web` for a database-free preview.
export const webRoot = fileURLToPath(new URL("../web/", import.meta.url));

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
  // HTTPS only from here on (one year, subdomains included); left out where cookies are not Secure (local http development).
  ...(process.env.COOKIE_SECURE !== "0" ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://upload.wikimedia.org https://thumb.wikimedia.org; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function resolvePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes("\0")) return null;
  let rel = normalize(decoded).replace(/^([/\\])+/, "");
  if (rel === "" || rel.endsWith(sep) || rel.endsWith("/")) rel = join(rel, "index.html");
  const full = join(webRoot, rel);
  if (!full.startsWith(webRoot)) return null;
  return full;
}

async function findFile(pathname) {
  const candidates = [];
  const base = resolvePath(pathname);
  if (!base) return null;
  candidates.push(base);
  if (!extname(base)) candidates.push(base + ".html", join(base, "index.html"));
  for (const file of candidates) {
    try {
      const s = await stat(file);
      if (s.isFile()) return file;
    } catch { /* try next */ }
  }
  return null;
}

// Text assets are compressed once per file version and kept in memory. Compression runs off the event loop (zlib's
// thread pool) and concurrent first requests for one file share a single job.
const compressible = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".xml"]);
const compressedCache = new Map();
const brotliAsync = promisify(brotliCompress), gzipAsync = promisify(gzip);
export function pickEncoding(acceptEncoding) {
  const accept = String(acceptEncoding || "");
  return /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
}
async function negotiate(req, ext, key, version, body) {
  if (!compressible.has(ext) || body.length < 1024) return null;
  const encoding = pickEncoding(req.headers["accept-encoding"]);
  if (!encoding) return null;
  const k = encoding + ":" + key;
  const hit = compressedCache.get(k);
  if (hit && hit.version === version) return { encoding, body: await hit.body };
  const job = encoding === "br"
    ? brotliAsync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : gzipAsync(body, { level: 9 });
  compressedCache.set(k, { version, body: job });
  job.catch(() => { if (compressedCache.get(k)?.body === job) compressedCache.delete(k); });
  return { encoding, body: await job };
}

/* Content fingerprints. Every asset a page references (assets/css, assets/js, fonts, images) is linked with
   ?v=<first 10 hex of its SHA-256>, rewritten as the HTML is served, so a page always names the exact bytes it was
   built with and nobody has to bump ?v= by hand. A request whose ?v= matches the file's current fingerprint is
   cached for a year as immutable; any other version (an old page, a hand-typed URL) gets the short policy and an
   ETag. Fingerprints are kept per file and re-checked against its mtime at most every 2 seconds. */
const FINGERPRINT_TTL = 2000;
const fingerprints = new Map();
async function fingerprint(file) {
  const now = Date.now(), hit = fingerprints.get(file);
  if (hit && now - hit.checked < FINGERPRINT_TTL) return hit.value;
  try {
    const info = await stat(file);
    if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) { hit.checked = now; return hit.value; }
    const value = createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 10);
    fingerprints.set(file, { value, mtimeMs: info.mtimeMs, size: info.size, checked: now });
    return value;
  } catch {
    fingerprints.delete(file);
    return null;
  }
}
const ASSET_REF = /((?:href|src)=")((?:\/|\.\.\/)?assets\/[^"?#]+\.(?:css|js|woff2|webp|png|jpe?g|svg|ico|webmanifest))(?:\?[^"#]*)?(")/g;
export async function fingerprintHtml(html) {
  const refs = new Map();
  for (const m of html.matchAll(ASSET_REF)) refs.set(m[2], null);
  await Promise.all([...refs.keys()].map(async ref => {
    const file = resolvePath("/" + ref.replace(/^(\.\.\/)+|^\//, ""));
    refs.set(ref, file ? await fingerprint(file) : null);
  }));
  return html.replace(ASSET_REF, (all, pre, ref, post) => refs.get(ref) ? pre + ref + "?v=" + refs.get(ref) + post : all);
}

/* A single "bytes=start-end" range (also "start-" and "-suffix"); null for none, false when unsatisfiable. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (!m[1]) { const n = Number(m[2]); if (!n) return false; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { start, end };
}
async function sendVideo(req, res, file, ext, method, status) {
  const { size } = await stat(file);
  const range = status === 200 ? parseRange(req.headers.range, size) : null;
  const base = { ...securityHeaders, "Content-Type": types[ext], "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=604800" };
  if (range === false) { res.writeHead(416, { ...base, "Content-Range": "bytes */" + size, "Content-Length": 0 }); res.end(); return true; }
  const { start, end } = range || { start: 0, end: size - 1 };
  res.writeHead(range ? 206 : status, { ...base, "Content-Length": end - start + 1, ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (method === "HEAD") { res.end(); return true; }
  const { createReadStream } = await import("node:fs");
  await new Promise((resolve, reject) => { const stream = createReadStream(file, { start, end }); stream.on("error", reject); res.on("close", resolve); stream.on("end", resolve); stream.pipe(res); });
  return true;
}

/* Retired prototype scripts that hold illustrative sample data (invented trades, prices and a politician's
 * transactions). No page loads them, and they are never served, so nothing invented can reach a browser.
 * Kept in the repository only until they are deleted; see docs/COMPLIANCE.md. */
export const RETIRED_ASSETS = Object.freeze(["/assets/js/alerts.js", "/assets/js/dashboard.js", "/assets/js/company.js"]);

export async function serveStatic(req, res) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const url = new URL(req.url || "/", "http://localhost");
  let requested = url.pathname;
  try { requested = decodeURIComponent(requested); } catch { /* resolvePath refuses it below */ }
  if (RETIRED_ASSETS.includes(normalize(requested).replace(/\\/g, "/").toLowerCase())) return false;
  let file = await findFile(url.pathname);
  let status = 200;
  if (!file) {
    if (extname(url.pathname)) return false;
    file = join(webRoot, "404.html");
    status = 404;
    try { await stat(file); } catch { return false; }
  }
  const ext = extname(file).toLowerCase();
  const longLived = /\/assets\/(fonts|img|icons|video)\//.test(file.split(sep).join("/"));
  // Video is sent whole or by byte range (Safari and iOS only play MP4 that answers Range requests).
  if (ext === ".mp4" || ext === ".webm") return sendVideo(req, res, file, ext, method, status);
  let [raw, info] = await Promise.all([readFile(file), stat(file)]);
  let version = info.mtimeMs + ":" + info.size;
  if (ext === ".html") {
    raw = Buffer.from(await fingerprintHtml(raw.toString("utf8")));
    version = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }
  const tag = ext === ".html" ? version : await fingerprint(file);
  const etag = tag ? '"' + tag + '"' : null;
  const requestedVersion = url.searchParams.get("v");
  const immutable = !!tag && ext !== ".html" && requestedVersion === tag;
  const headers = {
    ...securityHeaders,
    "Content-Type": types[ext] || "application/octet-stream",
    ...(compressible.has(ext) ? { "Vary": "Accept-Encoding" } : {}),
    ...(etag ? { "ETag": etag } : {}),
    "Cache-Control": ext === ".html" ? "no-cache" : immutable ? "public, max-age=31536000, immutable" : longLived ? "public, max-age=604800" : "public, max-age=3600"
  };
  // A cached copy that is still current is confirmed with an empty 304 instead of being sent again.
  const ifNoneMatch = String(req.headers["if-none-match"] || "");
  if (status === 200 && etag && ifNoneMatch.split(/\s*,\s*/).some(t => t.replace(/^W\//, "") === etag || t === "*")) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  const packed = await negotiate(req, ext, file, version, raw);
  const body = packed ? packed.body : raw;
  res.writeHead(status, { ...headers, "Content-Length": body.length, ...(packed ? { "Content-Encoding": packed.encoding } : {}) });
  res.end(method === "HEAD" ? undefined : body);
  return true;
}

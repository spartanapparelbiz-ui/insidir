import { readFile, stat } from "node:fs/promises";
import { brotliCompressSync, gzipSync, constants as zlib } from "node:zlib";
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

// Text assets are compressed once per file version and kept in memory.
const compressible = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".xml"]);
const compressedCache = new Map();
function negotiate(req, ext, file, mtimeMs, body) {
  if (!compressible.has(ext) || body.length < 1024) return null;
  const accept = String(req.headers["accept-encoding"] || "");
  const encoding = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  if (!encoding) return null;
  const key = encoding + ":" + file;
  const hit = compressedCache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return { encoding, body: hit.body };
  const out = encoding === "br"
    ? brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : gzipSync(body, { level: 9 });
  compressedCache.set(key, { mtimeMs, body: out });
  return { encoding, body: out };
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

export async function serveStatic(req, res) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const url = new URL(req.url || "/", "http://localhost");
  let file = await findFile(url.pathname);
  let status = 200;
  if (!file) {
    if (extname(url.pathname)) return false;
    file = join(webRoot, "404.html");
    status = 404;
    try { await stat(file); } catch { return false; }
  }
  const ext = extname(file).toLowerCase();
  const immutable = /\/assets\/(fonts|img|icons|video)\//.test(file.split(sep).join("/"));
  // Video is sent whole or by byte range (Safari and iOS only play MP4 that answers Range requests).
  if (ext === ".mp4" || ext === ".webm") return sendVideo(req, res, file, ext, method, status);
  const [raw, info] = await Promise.all([readFile(file), stat(file)]);
  const packed = negotiate(req, ext, file, info.mtimeMs, raw);
  const body = packed ? packed.body : raw;
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": types[ext] || "application/octet-stream",
    "Content-Length": body.length,
    ...(packed ? { "Content-Encoding": packed.encoding } : {}),
    ...(compressible.has(ext) ? { "Vary": "Accept-Encoding" } : {}),
    "Cache-Control": ext === ".html" ? "no-cache" : immutable ? "public, max-age=604800" : "public, max-age=3600"
  });
  res.end(method === "HEAD" ? undefined : body);
  return true;
}

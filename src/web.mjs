import { readFile, stat } from "node:fs/promises";
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
  ".xml": "application/xml; charset=utf-8"
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
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
  const body = await readFile(file);
  const ext = extname(file).toLowerCase();
  const immutable = /\/assets\/(fonts|img|icons)\//.test(file.split(sep).join("/"));
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": types[ext] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": ext === ".html" ? "no-cache" : immutable ? "public, max-age=604800" : "public, max-age=3600"
  });
  res.end(method === "HEAD" ? undefined : body);
  return true;
}

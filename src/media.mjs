/* Server-side image fetching for company logos and people photos.
 * Images come from public logo services, Wikimedia, SEC filings and companies' own sites, so
 * every request is checked: https only, public addresses only (re-checked on each redirect),
 * bounded size and time, and the bytes must really be an image of an allowed type. Results are
 * served from this origin so the page CSP stays 'self' and the browser can process logos. */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const IMAGE_TYPES = new Map([
  ["image/png", "png"], ["image/jpeg", "jpeg"], ["image/jpg", "jpeg"], ["image/webp", "webp"], ["image/gif", "gif"],
  ["image/svg+xml", "svg"], ["image/x-icon", "ico"], ["image/vnd.microsoft.icon", "ico"]
]);

function ipv4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) || (a === 203 && b === 0);
}
export function privateAddress(ip) {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return ipv4Private(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6) || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8");
}
export async function assertPublic(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("Only public https image URLs are allowed");
  if (isIP(u.hostname)) { if (privateAddress(u.hostname)) throw new Error("Private address"); return u; }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || /(^|\.)(localhost|internal|local)$/i.test(u.hostname)) throw new Error("Invalid host");
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error("Host resolves to a private address");
  return u;
}

/* Identify the format from the bytes themselves; a mislabeled HTML error page is not an image. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("latin1", 0, 4) === "GIF8") return "gif";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  const head = buf.toString("utf8", 0, Math.min(buf.length, 2048)).replace(/^﻿/, "").trimStart().toLowerCase();
  if ((head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!--")) && head.includes("<svg")) return "svg";
  return null;
}
/* SVGs are rendered as <img> and served with a sandbox CSP, but anything active is refused anyway. */
export function safeSvg(buf) {
  const text = buf.toString("utf8");
  return !/<script|javascript:|<foreignobject|\son[a-z]+\s*=|<iframe|<embed|<object/i.test(text);
}
export const MIME = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon" };

export async function fetchImage(url, { maxBytes = 1_500_000, timeoutMs = 8000, userAgent = "InsidirResearch/1.0", headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetch(current, { redirect: "manual", signal: abort.signal,
        headers: { "User-Agent": userAgent, Accept: "image/webp,image/png,image/jpeg,image/svg+xml;q=0.9,image/*;q=0.5", ...headers } });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        current = new URL(response.headers.get("location"), current).href;
        continue;
      }
      if (!response.ok) throw Object.assign(new Error("Image responded " + response.status), { upstreamStatus: response.status, retryAfter: response.headers.get("retry-after") });
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > maxBytes) throw new Error("Image too large");
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); throw new Error("Image too large"); }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      const type = sniffImage(bytes);
      const declaredType = IMAGE_TYPES.get(String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase());
      if (!type || (declaredType && declaredType !== type && !(declaredType === "ico" && type === "png"))) throw new Error("Not an image");
      if (type === "svg" && !safeSvg(bytes)) throw new Error("SVG with active content refused");
      return { bytes, type, url: current };
    } finally { clearTimeout(timer); }
  }
  throw new Error("Too many redirects");
}

/* PNG/JPEG/GIF/WebP pixel dimensions from headers, for size checks without an image library. */
export function imageSize(bytes, type) {
  try {
    if (type === "png") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (type === "gif") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    if (type === "webp") {
      const chunk = bytes.toString("latin1", 12, 16);
      if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") { const b = bytes.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    }
    if (type === "jpeg") {
      let i = 2;
      while (i < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1], length = bytes.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
        i += 2 + length;
      }
    }
  } catch { /* truncated header */ }
  return null;
}

export function sendImage(res, image, maxAge = 86400, extra = {}) {
  res.writeHead(200, {
    "Content-Type": MIME[image.type] || "application/octet-stream",
    "Content-Length": image.bytes.length,
    "Cache-Control": "public, max-age=" + maxAge,
    "X-Content-Type-Options": "nosniff",
    // Served from this origin: never let an image document run anything if opened directly.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra
  });
  res.end(image.bytes);
}

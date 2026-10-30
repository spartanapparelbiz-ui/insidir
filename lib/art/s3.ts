/* The art bucket (Railway Storage Bucket, S3-compatible and private): put and get, signed with AWS Signature V4 by
 * hand so no SDK is needed. Configured by the bucket's variables, referenced on each service:
 *   ART_BUCKET_ENDPOINT  ${{insidir-art.ENDPOINT}}         ART_BUCKET_NAME    ${{insidir-art.BUCKET}}
 *   ART_BUCKET_REGION    ${{insidir-art.REGION}}           ART_BUCKET_KEY_ID  ${{insidir-art.ACCESS_KEY_ID}}
 *   ART_BUCKET_SECRET    ${{insidir-art.SECRET_ACCESS_KEY}}
 * Railway buckets have no public URLs, so the site serves the files itself (app/art/[...key]/route.ts). Server only. */
import { createHash, createHmac } from "node:crypto";

interface Bucket { endpoint: URL; name: string; region: string; keyId: string; secret: string }

export function bucket(): Bucket | null {
  const e = process.env;
  if (!e.ART_BUCKET_ENDPOINT || !e.ART_BUCKET_NAME || !e.ART_BUCKET_KEY_ID || !e.ART_BUCKET_SECRET) return null;
  return { endpoint: new URL(e.ART_BUCKET_ENDPOINT), name: e.ART_BUCKET_NAME, region: e.ART_BUCKET_REGION || "auto", keyId: e.ART_BUCKET_KEY_ID, secret: e.ART_BUCKET_SECRET };
}

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** A signed request for one object (virtual-host style: <bucket>.<endpoint host>/<key>). */
export function signed(b: Bucket, method: "GET" | "PUT" | "HEAD", key: string, body?: Buffer, extra: Record<string, string> = {}, now = new Date()): { url: string; headers: Record<string, string> } {
  const host = `${b.name}.${b.endpoint.host}`;
  const path = "/" + key.split("/").map(enc).join("/");
  const amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amz.slice(0, 8);
  const payload = body ? sha(body) : sha("");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payload, "x-amz-date": amz, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v])) };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", ...names.map(n => `${n}:${headers[n]!.trim()}`), "", names.join(";"), payload].join("\n");
  const scope = `${day}/${b.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n");
  const kDate = hmac(`AWS4${b.secret}`, day), kRegion = hmac(kDate, b.region), kService = hmac(kRegion, "s3"), kSigning = hmac(kService, "aws4_request");
  const sig = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const { host: _h, ...rest } = headers;
  return { url: `${b.endpoint.protocol}//${host}${path}`, headers: { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${b.keyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` } };
}

/** Stores one file for good: the key carries a content hash, so it can be cached forever. */
export async function putObject(b: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
  const r = signed(b, "PUT", key, body, { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" });
  const res = await fetch(r.url, { method: "PUT", headers: r.headers, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`bucket put ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export async function getObject(b: Bucket, key: string): Promise<Response> {
  const r = signed(b, "GET", key);
  return fetch(r.url, { headers: r.headers, cache: "no-store" });
}

/* Storage for prepared images and the decisions that chose them.
 * Memory first (bounded), then PostgreSQL when DATABASE_URL is configured, so a restart or a
 * second instance does not refetch third-party sources. Without a database everything still
 * works from memory (website preview, tests). */
import { createHash } from "node:crypto";
import { pool } from "./db.mjs";
import { MIME } from "./media.mjs";

const MEMORY_BYTES = 160 * 1024 * 1024;
const media = new Map(); // sha -> {bytes, mime, width, height}
let memoryBytes = 0;
const records = new Map(); // kind:key -> {value, expiresAt}
let dbOk = Boolean(pool);
const warnOnce = (() => { let warned = false; return e => { if (!warned) { warned = true; console.warn("Media store database unavailable; using memory only:", e?.message); } }; })();
async function db(sql, params) {
  if (!dbOk) return null;
  try { return await pool.query(sql, params); }
  catch (e) { if (/relation .* does not exist|ECONNREFUSED|ENOTFOUND/.test(String(e?.message))) dbOk = false; warnOnce(e); return null; }
}
function remember(sha, item) {
  if (media.has(sha)) return;
  media.set(sha, item);
  memoryBytes += item.bytes.length;
  while (memoryBytes > MEMORY_BYTES && media.size) {
    const [oldest, value] = media.entries().next().value;
    media.delete(oldest);
    memoryBytes -= value.bytes.length;
  }
}

export async function putMedia(image) {
  const mime = MIME[image.type];
  if (!mime) throw new Error("Unsupported media type");
  const sha = createHash("sha256").update(image.bytes).digest("hex");
  remember(sha, { bytes: image.bytes, mime, width: image.width || null, height: image.height || null });
  await db("INSERT INTO entity_media(sha256,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5) ON CONFLICT (sha256) DO NOTHING",
    [sha, mime, image.bytes, image.width || null, image.height || null]);
  return { sha, url: "/v1/media/" + sha + "." + image.type, mime };
}
export async function getMedia(sha) {
  if (!/^[a-f0-9]{64}$/.test(sha)) return null;
  const hit = media.get(sha);
  if (hit) return hit;
  const row = (await db("SELECT mime,bytes,width,height FROM entity_media WHERE sha256=$1", [sha]))?.rows?.[0];
  if (!row) return null;
  const item = { bytes: row.bytes, mime: row.mime, width: row.width, height: row.height };
  remember(sha, item);
  return item;
}

/* Whether the bytes for a content address are stored, without loading them (getMedia selects
 * the whole image). Stored images are never deleted from the database, so a positive answer is
 * remembered; a miss is asked again next time. */
const present = new Set();
export async function hasMedia(sha) {
  if (!/^[a-f0-9]{64}$/.test(String(sha || ""))) return false;
  if (media.has(sha) || present.has(sha)) return true;
  const row = (await db("SELECT 1 FROM entity_media WHERE sha256=$1", [sha]))?.rows?.[0];
  if (!row) return false;
  if (present.size >= 50000) present.delete(present.values().next().value);
  present.add(sha);
  return true;
}
/* "/v1/media/<sha>.<ext>" -> sha, or null. */
export function mediaSha(src) {
  return /^\/v1\/media\/([a-f0-9]{64})\.(?:png|webp|jpeg|svg)$/.exec(String(src || ""))?.[1] || null;
}

export async function getRecord(kind, key) {
  const id = kind + ":" + key, hit = records.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const row = (await db("SELECT value,expires_at FROM media_records WHERE kind=$1 AND key=$2 AND expires_at>now()", [kind, key]))?.rows?.[0];
  if (!row) return null;
  records.set(id, { value: row.value, expiresAt: new Date(row.expires_at).getTime() });
  return row.value;
}
export async function putRecord(kind, key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  records.set(kind + ":" + key, { value, expiresAt });
  if (records.size > 20000) records.delete(records.keys().next().value);
  await db(`INSERT INTO media_records(kind,key,value,expires_at,updated_at) VALUES($1,$2,$3,$4,now())
    ON CONFLICT (kind,key) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at,updated_at=now()`,
    [kind, key, JSON.stringify(value), new Date(expiresAt)]);
}
export function storeStats() { return { items: media.size, bytes: memoryBytes, records: records.size, database: dbOk }; }

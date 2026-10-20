/* Rate limits shared by every engine instance.
 *
 * Fixed-window counters in PostgreSQL (rate_limits, sql/013): one atomic upsert per check, so two instances
 * behind a load balancer count the same attempts, and a restart does not reset anybody's allowance. Keys are
 * SHA-256 digests of the logical key ("login-email:alice@example.com"), so the table never holds an email or a
 * client address in clear.
 *
 * Interface (every method is async):
 *   hit(key, limit, windowMs)   counts one attempt; true when this attempt is over the limit
 *   atLimit(key, limit)         read-only: has the allowance already been spent?
 *   fail(key, windowMs)         counts one attempt without a limit (failed sign-ins: only failures spend it)
 *
 * memoryLimiter() is the same interface in one process (no database: tests, `npm run web`). pgLimiter() falls back
 * to it for a check that cannot reach the database, so a database blip never turns into "nobody may sign in"; the
 * request that follows needs the database anyway and fails there. */
import { createHash } from "node:crypto";

const digest = key => createHash("sha256").update("insidir-rl:" + String(key)).digest("hex");

export function memoryLimiter({ now = () => Date.now(), max = 10000 } = {}) {
  const hits = new Map();
  const prune = () => { if (hits.size > max) { const t = now(); for (const [k, v] of hits) if (v.until <= t) hits.delete(k); } };
  const count = (key, windowMs) => {
    prune();
    const t = now(), v = hits.get(key);
    if (!v || v.until <= t) { const fresh = { count: 1, until: t + windowMs }; hits.set(key, fresh); return fresh; }
    v.count++; return v;
  };
  return {
    kind: "memory",
    async hit(key, limit, windowMs) { return count(key, windowMs).count > limit; },
    async atLimit(key, limit) { const v = hits.get(key); return !!v && v.until > now() && v.count >= limit; },
    async fail(key, windowMs) { count(key, windowMs); }
  };
}

const UPSERT = `INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+($2::bigint*interval '1 millisecond'))
  ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.count+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
  RETURNING count`;

export function pgLimiter({ query, fallback = memoryLimiter(), log = console } = {}) {
  const degrade = (e, op) => { log.warn?.(JSON.stringify({ event: "rate_limit.db_unavailable", op, error: String(e?.code || e?.message || e) })); };
  return {
    kind: "postgres",
    async hit(key, limit, windowMs) {
      try { return Number((await query(UPSERT, [digest(key), Math.max(1, Math.round(windowMs))])).rows[0]?.count) > limit; }
      catch (e) { degrade(e, "hit"); return fallback.hit(key, limit, windowMs); }
    },
    async atLimit(key, limit) {
      try { const r = await query("SELECT count FROM rate_limits WHERE key=$1 AND reset_at>now()", [digest(key)]); return Number(r.rows[0]?.count || 0) >= limit; }
      catch (e) { degrade(e, "atLimit"); return fallback.atLimit(key, limit); }
    },
    async fail(key, windowMs) {
      try { await query(UPSERT, [digest(key), Math.max(1, Math.round(windowMs))]); }
      catch (e) { degrade(e, "fail"); return fallback.fail(key, windowMs); }
    }
  };
}

// Expired windows are dead weight: removed by the hourly maintenance job.
export async function purgeRateLimits(query) {
  return (await query("DELETE FROM rate_limits WHERE reset_at<now()-interval '1 hour'")).rowCount || 0;
}

/* Whop settings the site reads at runtime: the plan the checkout sells, the webhook's signing secret and the login
 * app's id. `npm run whop:setup` (lib/billing/setup.ts) finds or makes them in Whop and stores them in
 * terminal.whop_config, the secret encrypted (AES-256-GCM, key derived from WHOP_API_KEY). Env vars override:
 * WHOP_PLAN_INSIDIR, WHOP_WEBHOOK_SECRET, WHOP_CLIENT_ID. Read once a minute. Server only. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { getDb, hasDatabase } from "@/lib/db";
import { whopConfig } from "@/lib/db/schema";
import { memo } from "@/lib/memo";

export type WhopConfigKey = "plan_id" | "plan_status" | "webhook_id" | "webhook_secret" | "app_id";

const keyFrom = (apiKey: string): Buffer => createHash("sha256").update(`insidir:whop_config:v1:${apiKey}`).digest();

/** "v1.<iv>.<tag>.<ciphertext>", base64url. */
export function encryptSecret(plain: string, apiKey: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(apiKey), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), data].map(x => (typeof x === "string" ? x : x.toString("base64url"))).join(".");
}

/** Null when it can't be read (a different WHOP_API_KEY, or tampered with). */
export function decryptSecret(box: string, apiKey: string): string | null {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || !data || !apiKey) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyFrom(apiKey), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}

export async function readConfig(db: Db): Promise<Partial<Record<WhopConfigKey, string>>> {
  const rows = await db.select().from(whopConfig);
  return Object.fromEntries(rows.filter(r => r.value !== null).map(r => [r.key, r.value!]));
}

export async function writeConfig(db: Db, key: WhopConfigKey, value: string | null): Promise<void> {
  await db.insert(whopConfig).values({ key, value }).onConflictDoUpdate({ target: whopConfig.key, set: { value, updatedAt: sql`now()` } });
}

export async function clearConfig(db: Db, key: WhopConfigKey): Promise<void> {
  await db.delete(whopConfig).where(eq(whopConfig.key, key));
}

export interface WhopRuntime { planId: string | null; webhookSecret: string | null; clientId: string | null }

/** What the site uses now: env first, then what setup stored. */
export function resolveRuntime(stored: Partial<Record<WhopConfigKey, string>>, env: Record<string, string | undefined> = process.env): WhopRuntime {
  const apiKey = env.WHOP_API_KEY ?? "";
  return {
    planId: env.WHOP_PLAN_INSIDIR || stored.plan_id || null,
    webhookSecret: env.WHOP_WEBHOOK_SECRET || (stored.webhook_secret ? decryptSecret(stored.webhook_secret, apiKey) : null) || null,
    clientId: env.WHOP_CLIENT_ID || stored.app_id || null,
  };
}

export async function whopRuntime(): Promise<WhopRuntime> {
  const stored = hasDatabase() ? await memo("whop_config", 60_000, () => readConfig(getDb())).catch(() => ({})) : {};
  return resolveRuntime(stored);
}

/* Read-only: is <APP_URL>/reset/callback a redirect URI of our Whop login app? Prints the app's id, name and redirect
 * URIs and one verdict line. Changes nothing in Whop or the database (it only reads the stored app_id). Run on Railway,
 * where WHOP_API_KEY is: npx tsx scripts/whop-login-check.ts */
import { readConfig } from "@/lib/billing/config";
import { APP_NAME } from "@/lib/billing/setup";
import { closeDb, getDb, hasDatabase } from "@/lib/db";

type Json = Record<string, unknown>;
async function main(): Promise<void> {
  const env = process.env;
  const api = `${(env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "")}/api/v1`;
  const redirect = `${(env.APP_URL ?? "https://insidir.com").replace(/\/+$/, "")}/reset/callback`;
  const get = async (path: string) => {
    const r = await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${env.WHOP_API_KEY ?? ""}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Json };
  };
  const stored = hasDatabase() ? await readConfig(getDb()).catch(() => ({} as Record<string, string>)) : {};
  const id = env.WHOP_CLIENT_ID || (stored as Record<string, string>).app_id || null;
  console.log(`whop-login-check: app id from ${env.WHOP_CLIENT_ID ? "WHOP_CLIENT_ID" : id ? "stored app_id" : "nowhere (searching by name)"}; WHOP_CLIENT_SECRET ${env.WHOP_CLIENT_SECRET ? "is" : "is NOT"} set`);
  const apps: Json[] = [];
  if (id) { const r = await get(`/apps/${encodeURIComponent(id)}`); console.log(`whop-login-check: GET /apps/${id} → ${r.status}`); if (r.status === 200) apps.push(r.json); }
  const q = new URLSearchParams({ first: "100" });
  if (env.WHOP_COMPANY_ID) q.set("company_id", env.WHOP_COMPANY_ID);
  const l = await get(`/apps?${q}`);
  console.log(`whop-login-check: GET /apps → ${l.status}`);
  for (const a of (Array.isArray(l.json.data) ? l.json.data : []) as Json[]) if (!apps.some(x => x.id === a.id)) apps.push(a);
  for (const a of apps) console.log(`whop-login-check: app ${String(a.id)} "${String(a.name)}" redirect_uris=${JSON.stringify(a.redirect_uris ?? null)}`);
  const ours = apps.find(a => a.id === id) ?? apps.find(a => a.name === APP_NAME) ?? null;
  const uris = Array.isArray(ours?.redirect_uris) ? (ours!.redirect_uris as string[]) : [];
  console.log(ours ? (uris.includes(redirect) ? `whop-login-check: OK ${String(ours.id)} has ${redirect}` : `whop-login-check: MISSING ${String(ours.id)} lacks ${redirect}; add exactly that URI`) : "whop-login-check: NO APP found");
  await closeDb();
}
main().catch(e => { console.error("whop-login-check failed:", e instanceof Error ? e.message : e); process.exit(1); });

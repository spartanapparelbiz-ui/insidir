/* `npm run whop:setup` (scripts/whop-setup.ts), run on every deploy after the migrations. Idempotent: it only makes
 * what's missing, and never prints a secret.
 *   1. Plan: the visible $39/month plan of WHOP_PRODUCT_INSIDIR. Stored as plan_id only when it is exactly what the
 *      site says (7-day trial, $1 initial fee, $39 every month); otherwise plan_id is cleared, so checkout stays
 *      closed, and the log says what's different.
 *   2. Webhook: one for <APP_URL>/api/billing/webhook with EVENTS. Created when missing, its secret (only in the
 *      create response) stored encrypted. Never a second one: an existing webhook gets missing events added; one
 *      whose secret we don't hold (and isn't in WHOP_WEBHOOK_SECRET) is replaced, delete first, then create.
 *   3. Login app: a Whop app named "Insidir" whose redirect URIs include <APP_URL>/login/callback (log in); created or updated, its app_ id stored.
 * Ends with one line: "Whop setup: plan ok|wrong, webhook ok|failed, login app ok|failed". */
import type { Db } from "@/lib/db";
import { TRIAL, PLANS } from "@/lib/plans";
import { encryptSecret, decryptSecret, readConfig, writeConfig, clearConfig } from "./config";

export const EVENTS = ["membership.activated", "membership.updated", "membership.deactivated", "membership.trial_ending_soon", "payment.succeeded",
  "payment.failed", "refund.created", "refund.updated", "dispute.created"] as const;
export const APP_NAME = "Insidir";
const MONTH_DAYS = [28, 29, 30, 31];

type Json = Record<string, unknown>;
export interface SetupDeps {
  db: Db;
  env: Record<string, string | undefined>;
  /** fetch, bound to Whop's API (tests pass a stand-in). */
  fetch: typeof fetch;
  log: (line: string) => void;
}
export interface SetupResult { plan: "ok" | "wrong"; webhook: "ok" | "failed"; app: "ok" | "failed"; line: string }

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const money = (n: number | null) => (n === null ? "none" : `$${n % 1 ? n.toFixed(2) : n}`);

/** What's different from 7-day trial + $1 initial fee + $39/month, in words; empty when it matches. */
export function planProblems(p: Json): string[] {
  const out: string[] = [];
  const renewal = num(p.renewal_price), initial = num(p.initial_price), trial = num(p.trial_period_days), period = num(p.billing_period);
  const type = str(p.billing_type) ?? str(p.plan_type);
  if (type && type !== "renewal") out.push(`it is ${type}, not a monthly subscription`);
  if (renewal !== PLANS.insidir.price) out.push(`renews at ${money(renewal)}, not $${PLANS.insidir.price}`);
  if (period === null || !MONTH_DAYS.includes(period)) out.push(`bills every ${period ?? "?"} days, not monthly`);
  if (trial !== TRIAL.days) out.push(`trial is ${trial ?? 0} days, not ${TRIAL.days}`);
  if (initial !== TRIAL.fee) out.push(`initial fee is ${money(initial)}, not $${TRIAL.fee}`);
  const cur = str(p.currency);
  if (cur && cur.toLowerCase() !== "usd") out.push(`currency is ${cur}, not usd`);
  return out;
}

export async function runWhopSetup(d: SetupDeps): Promise<SetupResult> {
  const { db, env, log } = d;
  const api = `${(env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "")}/api/v1`;
  const key = env.WHOP_API_KEY ?? "", company = env.WHOP_COMPANY_ID ?? "", product = env.WHOP_PRODUCT_INSIDIR ?? "";
  const appUrl = (env.APP_URL ?? "https://insidir.com").replace(/\/+$/, "");
  const hookUrl = `${appUrl}/api/billing/webhook`, redirect = `${appUrl}/login/callback`;
  const call = async (method: string, path: string, body?: Json): Promise<{ ok: boolean; status: number; json: Json }> => {
    const res = await d.fetch(`${api}${path}`, {
      method, headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    return { ok: res.ok, status: res.status, json };
  };
  const list = (j: Json): Json[] => (Array.isArray(j.data) ? (j.data as Json[]) : Array.isArray(j) ? (j as unknown as Json[]) : []);
  const why = (r: { status: number; json: Json }) => `HTTP ${r.status}${str((r.json.error as Json | undefined)?.message) ? `: ${str((r.json.error as Json).message)}` : ""}`;
  const stored = await readConfig(db);

  // 1. The plan.
  let plan: SetupResult["plan"] = "wrong";
  try {
    if (!key || !product) throw new Error(`missing ${!key ? "WHOP_API_KEY" : "WHOP_PRODUCT_INSIDIR"}`);
    const q = new URLSearchParams({ first: "50" });
    if (company) { q.set("company_id", company); q.set("account_id", company); }
    q.append("product_ids[]", product);
    let r = await call("GET", `/plans?${q}`);
    if (r.status === 404) r = await call("GET", `/variants?${q}`);
    if (!r.ok) throw new Error(`couldn't list plans (${why(r)})`);
    const plans = list(r.json).filter(p => !p.product || str((p.product as Json).id) === null || str((p.product as Json).id) === product);
    const visible = plans.filter(p => (str(p.visibility) ?? "visible") === "visible");
    const pick = visible.find(p => num(p.renewal_price) === PLANS.insidir.price) ?? null;
    if (!pick) {
      const seen = visible.map(p => `${str(p.id)} renews at ${money(num(p.renewal_price))}`).join("; ") || "no visible plans";
      log(`Whop plan: no visible $${PLANS.insidir.price}/month plan on ${product} (${seen}). Checkout stays closed.`);
    } else {
      const id = str(pick.id)!;
      log(`Whop plan ${id}: ${money(num(pick.renewal_price))} every ${num(pick.billing_period) ?? "?"} days, trial ${num(pick.trial_period_days) ?? 0} days, initial fee ${money(num(pick.initial_price))}.`);
      const problems = planProblems(pick);
      if (problems.length) log(`Whop plan ${id} is not what the site says (7 days for $1, then $39/month): ${problems.join("; ")}. Checkout stays closed.`);
      else plan = "ok";
      await writeConfig(db, "plan_status", problems.length ? `wrong: ${problems.join("; ")}` : "ok");
      if (plan === "ok") await writeConfig(db, "plan_id", id);
    }
  } catch (e) {
    log(`Whop plan: ${e instanceof Error ? e.message : String(e)}. Checkout stays closed.`);
  }
  if (plan !== "ok") await clearConfig(db, "plan_id");

  // 2. The webhook.
  let webhook: SetupResult["webhook"] = "failed";
  try {
    const q = new URLSearchParams({ first: "100" });
    if (company) q.set("account_id", company);
    const r = await call("GET", `/webhooks?${q}`);
    if (!r.ok) throw new Error(`couldn't list webhooks (${why(r)})`);
    const ours = list(r.json).filter(w => str(w.url) === hookUrl);
    const known = Boolean(env.WHOP_WEBHOOK_SECRET) || Boolean(stored.webhook_secret && decryptSecret(stored.webhook_secret, key));
    let keep = ours.find(w => str(w.id) === stored.webhook_id) ?? ours[0] ?? null;
    if (keep && !known) {
      // Its secret can't be read back from Whop, and we don't have it: replace it (delete, then create one).
      for (const w of ours) { const del = await call("DELETE", `/webhooks/${encodeURIComponent(str(w.id)!)}`); if (!del.ok) throw new Error(`couldn't replace the webhook (${why(del)})`); }
      log("Whop webhook: the existing one's secret wasn't stored, so it was replaced.");
      keep = null;
    } else if (ours.length > 1) {
      for (const w of ours.filter(w => w !== keep)) await call("DELETE", `/webhooks/${encodeURIComponent(str(w.id)!)}`);
      log(`Whop webhook: removed ${ours.length - 1} duplicate(s).`);
    }
    if (keep) {
      const have = new Set(Array.isArray(keep.events) ? (keep.events as string[]) : []);
      const missing = EVENTS.filter(e => !have.has(e));
      if (missing.length || keep.enabled === false) {
        const u = await call("PATCH", `/webhooks/${encodeURIComponent(str(keep.id)!)}`, { events: [...new Set([...have, ...EVENTS])], enabled: true });
        if (!u.ok) throw new Error(`couldn't update the webhook (${why(u)})`);
        log(`Whop webhook: added ${missing.length} event(s).`);
      }
      await writeConfig(db, "webhook_id", str(keep.id)!);
      webhook = "ok";
    } else {
      const c = await call("POST", "/webhooks", { url: hookUrl, events: [...EVENTS], enabled: true, ...(company ? { resource_id: company } : {}) });
      const secret = str(c.json.webhook_secret);
      if (!c.ok || !str(c.json.id)) throw new Error(`couldn't create the webhook (${why(c)})`);
      if (!secret) throw new Error("Whop didn't return the webhook's secret");
      await writeConfig(db, "webhook_secret", encryptSecret(secret, key));
      await writeConfig(db, "webhook_id", str(c.json.id)!);
      log(`Whop webhook created for ${hookUrl}.`);
      webhook = "ok";
    }
  } catch (e) {
    log(`Whop webhook: ${e instanceof Error ? e.message : String(e)}.`);
  }

  // 3. The login app (Log in, Whop's sign-in).
  let app: SetupResult["app"] = "failed";
  try {
    const q = new URLSearchParams({ first: "100", query: APP_NAME });
    if (company) q.set("account_id", company);
    const r = await call("GET", `/apps?${q}`);
    if (!r.ok) throw new Error(`couldn't list apps (${why(r)})`);
    const mine = list(r.json).filter(a => str(a.name) === APP_NAME && (!company || str((a.company as Json | undefined)?.id) === company || !a.company));
    let found = mine.find(a => str(a.id) === stored.app_id) ?? mine[0] ?? null;
    if (found) {
      const uris = Array.isArray(found.redirect_uris) ? (found.redirect_uris as string[]) : [];
      if (!uris.includes(redirect)) {
        const u = await call("PATCH", `/apps/${encodeURIComponent(str(found.id)!)}`, { redirect_uris: [...uris, redirect] });
        if (!u.ok) throw new Error(`couldn't add the redirect URI (${why(u)})`);
        log(`Whop login app: added ${redirect}.`);
      }
    } else {
      const c = await call("POST", "/apps", { account_id: company, name: APP_NAME, base_url: appUrl, redirect_uris: [redirect] });
      if (!c.ok || !str(c.json.id)) throw new Error(`couldn't create the app (${why(c)})`);
      found = c.json;
      log(`Whop login app created.`);
    }
    await writeConfig(db, "app_id", str(found.id)!);
    app = "ok";
  } catch (e) {
    log(`Whop login app: ${e instanceof Error ? e.message : String(e)}.`);
  }

  const line = `Whop setup: plan ${plan}, webhook ${webhook}, login app ${app}`;
  log(line);
  return { plan, webhook, app, line };
}

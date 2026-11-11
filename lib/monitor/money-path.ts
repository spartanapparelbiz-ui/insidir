/* The money-path monitor (server only), every MONEY_PATH_MS from the worker, against the live site (APP_URL):
 *   landing   GET /: 200 with the landing
 *   market    GET /market/<id> for an open market we hold (the newest millionaire bet's): the market page
 *   checkout  GET /go: the funnel; POST /api/checkout/start: the plan is open
 *   sign-in   GET /login/start: a redirect to Whop's authorize URL; GET that URL: Whop accepts it (no
 *             "redirect_uri is invalid", no error redirect)
 * Each run is kept (terminal.monitor_runs) and shown on /status. A failure is sent as a web push (lib/alerts/send.ts) to
 * every device subscribed by an account on FREE_ACCESS_EMAILS (the owners): when the path breaks, then at most hourly
 * while it stays broken, and once when it recovers. With no subscription, it's logged (and /status shows it either
 * way). The monitor browses as a visitor whose id starts with "monitor-", left out of every funnel number. */
import { randomUUID } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { sendPush } from "@/lib/alerts/send";
import { freeAccessEmails } from "@/lib/billing/free";
import { LANDING_MARK } from "@/lib/copy";
import type { Db } from "@/lib/db";
import { monitorRuns } from "@/lib/db/schema";
import { runProduct } from "./product";

export const MONEY_PATH_MS = 15 * 60_000;
const STEP_MS = 15_000;
export const MONITOR_VISITOR = /^monitor-/;
export interface Step { step: "landing" | "market" | "checkout" | "sign-in" | "today" | "search" | "fresh-bets" | "autopilot" | "exit-ping" | "freshness"; ok: boolean; ms: number; detail?: string }
export interface Alert { title: string; body: string; url: string }
/** "sent" to at least one device; "no_subscription" when no owner has a device subscribed; "failed" otherwise. */
export type NotifyOutcome = "sent" | "no_subscription" | "failed";
export interface MonitorDeps { base: string; f?: typeof fetch; notify?: (a: Alert) => Promise<NotifyOutcome>; now?: number; log?: (s: string) => void;
  /** With it, the product checks run after the money path (lib/monitor/product.ts): Kalshi's YES ask now. */
  yesAsk?: (kalshiId: string) => Promise<number | null>; sleep?: (ms: number) => Promise<void> }

/** The alert as a web push to every device subscribed by an account on FREE_ACCESS_EMAILS. Subscriptions the browser
 *  has dropped are deleted. */
export async function pushOwners(db: Db, a: Alert, send: typeof sendPush = sendPush): Promise<NotifyOutcome> {
  const owners = [...freeAccessEmails()];
  if (!owners.length) return "no_subscription";
  const r = await db.execute(sql`select s.endpoint, s.p256dh, s.auth from terminal.push_subscriptions s join terminal.users u on u.id = s.user_id
    where lower(u.email) in (${sql.join(owners.map(e => sql`${e}`), sql`, `)})`);
  const subs = r.rows as Array<{ endpoint: string; p256dh: string; auth: string }>;
  if (!subs.length) return "no_subscription";
  let sent = 0;
  for (const s of subs) {
    const out = await send(s, a).catch(() => "failed" as const);
    if (out === "sent") sent++;
    if (out === "gone") await db.execute(sql`delete from terminal.push_subscriptions where endpoint = ${s.endpoint}`).catch(() => undefined);
  }
  return sent ? "sent" : "failed";
}

class StepFailed extends Error {}
const must = (cond: unknown, why: string): void => { if (!cond) throw new StepFailed(why); };

/** The market the monitor reads: the newest large position's, on a market still open. */
async function marketToOpen(db: Db, now: number): Promise<string | null> {
  const r = await db.execute(sql`select market_id from terminal.millionaire_bets where at > ${new Date(now - 3 * 86_400_000)} order by at desc limit 1`);
  return (r.rows[0] as { market_id: string } | undefined)?.market_id ?? null;
}

/** Runs the path once; returns each step (stops at the first failure). */
export async function runMoneyPath(db: Db, d: MonitorDeps): Promise<Step[]> {
  const f = d.f ?? fetch, base = d.base.replace(/\/+$/, ""), now = d.now ?? Date.now();
  const cookie = `insidir_vid=monitor-${randomUUID().slice(0, 12)}`;
  const get = (path: string, init: RequestInit = {}) => f(path.startsWith("http") ? path : base + path, { redirect: "manual", signal: AbortSignal.timeout(STEP_MS), ...init, headers: { cookie, "user-agent": "InsidirMoneyPathMonitor/1", ...(init.headers ?? {}) } });
  const steps: Step[] = [];
  const run = async (step: Step["step"], fn: () => Promise<void>): Promise<boolean> => {
    const t0 = Date.now();
    try { await fn(); steps.push({ step, ok: true, ms: Date.now() - t0 }); return true; }
    catch (e) { steps.push({ step, ok: false, ms: Date.now() - t0, detail: (e instanceof StepFailed ? e.message : `request failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300) }); return false; }
  };
  if (!await run("landing", async () => {
    const r = await get("/");
    must(r.status === 200, `GET / answered ${r.status}`);
    must((await r.text()).includes(LANDING_MARK), "the home page doesn't show the landing");
  })) return steps;
  if (!await run("market", async () => {
    const id = await marketToOpen(db, now);
    must(id, "no millionaire trade in the last 3 days");
    const page = await get(`/market/${encodeURIComponent(id!)}`);
    must(page.status === 200 && (await page.text()).includes('data-testid="market-page"'), `GET /market/${id} answered ${page.status} without the market`);
  })) return steps;
  if (!await run("checkout", async () => {
    const page = await get("/go");
    must(page.status === 200 && (await page.text()).includes('data-testid="go-hook"'), `GET /go answered ${page.status} without the funnel`);
    const r = await get("/api/checkout/start", { method: "POST", body: JSON.stringify({ age18: true }), headers: { "content-type": "application/json" } });
    const j = (await r.json().catch(() => ({}))) as { planId?: string; message?: string };
    must(r.status === 200 && j.planId, `the checkout didn't open (${r.status}${j.message ? `: ${j.message}` : ""})`);
  })) return steps;
  await run("sign-in", async () => {
    const start = await get("/login/start");
    const to = start.headers.get("location") ?? "";
    must(start.status >= 300 && start.status < 400 && /\/oauth\/authorize\?/.test(to), `GET /login/start answered ${start.status} without a redirect to Whop`);
    const whop = await get(to);
    const where = whop.headers.get("location") ?? "";
    const text = whop.status >= 300 && whop.status < 400 ? "" : (await whop.text()).slice(0, 200_000);
    must(!/redirect_uri is invalid/i.test(text) && !/redirect_uri is invalid/i.test(decodeURIComponent(where)), `Whop said "redirect_uri is invalid" (${new URL(to).searchParams.get("redirect_uri")})`);
    must(whop.status < 400, `Whop's authorize answered ${whop.status}`);
    must(!/[?&]error=/.test(where), `Whop redirected with an error: ${where.slice(0, 200)}`);
  });
  return steps;
}

/** One monitor run: the path, kept, and pushed to the owners when it breaks (then at most hourly) or recovers. */
export async function moneyPathOnce(db: Db, d: MonitorDeps): Promise<{ ok: boolean; steps: Step[]; notified: NotifyOutcome | null }> {
  const t0 = Date.now(), now = d.now ?? t0;
  const steps = await runMoneyPath(db, d);
  if (d.yesAsk) steps.push(...await runProduct(db, { base: d.base, f: d.f, now, yesAsk: d.yesAsk, sleep: d.sleep }));
  const failed = steps.find(s => !s.ok) ?? null, ok = !failed;
  const prev = (await db.select().from(monitorRuns).orderBy(desc(monitorRuns.at)).limit(1))[0];
  const lastAlert = (await db.select({ at: monitorRuns.at }).from(monitorRuns).where(sql`notified and not ok`).orderBy(desc(monitorRuns.at)).limit(1))[0];
  const breaks = !ok && (!prev || prev.ok || !lastAlert || now - lastAlert.at.getTime() >= 3_600_000);
  const recovers = ok && prev && !prev.ok;
  let notified: NotifyOutcome | null = null;
  if (breaks || recovers) {
    const status = `${d.base.replace(/\/+$/, "")}/status`;
    const notify = d.notify ?? ((a: Alert) => pushOwners(db, a));
    notified = await notify(breaks
      ? { title: `Live test failing: ${failed!.step}`, body: (failed!.detail ?? "no detail").slice(0, 180), url: status }
      : { title: "Live tests passing again", body: `Every step passed: ${steps.map(s => `${s.step} ${s.ms} ms`).join(", ")}.`, url: status }).catch(() => "failed" as const);
    if (notified === "no_subscription") d.log?.(`money path: ${breaks ? "failing" : "recovered"}; no owner device subscribed to push (FREE_ACCESS_EMAILS), shown on /status only`);
    else if (notified === "failed") d.log?.("money path: the push alert didn't go through; shown on /status");
  }
  await db.insert(monitorRuns).values({ at: new Date(now), ok, failedStep: failed?.step ?? null, detail: failed?.detail ?? null, ms: Date.now() - t0, steps, notified: notified === "sent" });
  return { ok, steps, notified };
}

export interface MonitorView { last: { at: number; ok: boolean; failedStep: string | null; detail: string | null; ms: number; steps: Step[] } | null; failures24h: Array<{ at: number; step: string | null; detail: string | null }>; runs24h: number }

/** What /status shows: the last run, and the failures of the last 24 hours. */
export async function monitorView(db: Db, now: number): Promise<MonitorView> {
  const since = new Date(now - 86_400_000);
  const [last, fails, n] = await Promise.all([
    db.select().from(monitorRuns).orderBy(desc(monitorRuns.at)).limit(1),
    db.select().from(monitorRuns).where(sql`not ok and at >= ${since}`).orderBy(desc(monitorRuns.at)).limit(20),
    db.execute(sql`select count(*)::int as n from terminal.monitor_runs where at >= ${since}`),
  ]);
  const l = last[0];
  return {
    last: l ? { at: l.at.getTime(), ok: l.ok, failedStep: l.failedStep, detail: l.detail, ms: l.ms, steps: l.steps as Step[] } : null,
    failures24h: fails.map(x => ({ at: x.at.getTime(), step: x.failedStep, detail: x.detail })),
    runs24h: Number((n.rows[0] as { n: number } | undefined)?.n ?? 0),
  };
}

/* The money-path monitor (server only), every MONEY_PATH_MS from the worker, against the live site (APP_URL):
 *   landing   GET /: 200 with the headline
 *   read      POST /api/read for an open market we hold (the newest large position's), then GET /read/<id>: the card
 *   checkout  GET /start: the checkout page; POST /api/checkout/start: the plan is open
 *   sign-in   GET /login/start: a redirect to Whop's authorize URL; GET that URL: Whop accepts it (no
 *             "redirect_uri is invalid", no error redirect)
 * Each run is kept (terminal.monitor_runs) and shown on /status. A failure is emailed to hello@aethric.llc: when the path
 * breaks, then at most hourly while it stays broken, and once when it recovers. The monitor browses as a visitor whose
 * id starts with "monitor-", left out of every funnel number. */
import { randomUUID } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { HEADLINE, COMPANY } from "@/lib/copy";
import type { Db } from "@/lib/db";
import { monitorRuns } from "@/lib/db/schema";
import { sendEmail, type Email, type SendOutcome } from "@/lib/emails/transport";

export const MONEY_PATH_MS = 10 * 60_000;
const STEP_MS = 15_000;
export const MONITOR_VISITOR = /^monitor-/;
export interface Step { step: "landing" | "read" | "checkout" | "sign-in"; ok: boolean; ms: number; detail?: string }
export interface MonitorDeps { base: string; f?: typeof fetch; send?: (e: Email) => Promise<SendOutcome>; now?: number; log?: (s: string) => void }

class StepFailed extends Error {}
const must = (cond: unknown, why: string): void => { if (!cond) throw new StepFailed(why); };

/** The market the monitor reads: the newest large position's, on a market still open. */
async function marketToRead(db: Db, now: number): Promise<string | null> {
  const r = await db.execute(sql`select source, market_id from terminal.moves where source in ('polymarket', 'kalshi') and result is null and hidden_at is null
    and at > ${new Date(now - 3 * 86_400_000)} order by at desc limit 1`);
  const x = r.rows[0] as { source: string; market_id: string } | undefined;
  return x ? `${x.source}:${x.market_id}` : null;
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
    must((await r.text()).includes(HEADLINE), "the home page doesn't show the headline");
  })) return steps;
  if (!await run("read", async () => {
    const pick = await marketToRead(db, now);
    must(pick, "no open market to read in the last 3 days");
    const body = new FormData(); body.set("pick", pick!);
    const r = await get("/api/read", { method: "POST", body });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    must(r.status === 200 && j.id, `POST /api/read answered ${r.status}${j.error ? `: ${j.error}` : ""}`);
    const page = await get(`/read/${j.id}`);
    must(page.status === 200 && (await page.text()).includes('data-testid="read-card"'), `GET /read/${j.id} answered ${page.status} without the card`);
  })) return steps;
  if (!await run("checkout", async () => {
    const page = await get("/start");
    must(page.status === 200 && (await page.text()).includes('data-testid="start-pay"'), `GET /start answered ${page.status} without the checkout`);
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

/** One monitor run: the path, kept, and emailed when it breaks (then at most hourly) or recovers. */
export async function moneyPathOnce(db: Db, d: MonitorDeps): Promise<{ ok: boolean; steps: Step[]; emailed: SendOutcome | null }> {
  const t0 = Date.now(), now = d.now ?? t0;
  const steps = await runMoneyPath(db, d);
  const failed = steps.find(s => !s.ok) ?? null, ok = !failed;
  const prev = (await db.select().from(monitorRuns).orderBy(desc(monitorRuns.at)).limit(1))[0];
  const lastMail = (await db.select({ at: monitorRuns.at }).from(monitorRuns).where(sql`emailed and not ok`).orderBy(desc(monitorRuns.at)).limit(1))[0];
  const breaks = !ok && (!prev || prev.ok || !lastMail || now - lastMail.at.getTime() >= 3_600_000);
  const recovers = ok && prev && !prev.ok;
  let emailed: SendOutcome | null = null;
  if (breaks || recovers) {
    const send = d.send ?? ((e: Email) => sendEmail(e));
    emailed = await send(breaks ? {
      to: COMPANY.email, subject: `Insidir money path failing: ${failed!.step}`,
      text: [`The money-path check failed at "${failed!.step}": ${failed!.detail ?? "no detail"}.`, "", ...steps.map(s => `${s.ok ? "ok  " : "FAIL"} ${s.step} (${s.ms} ms)${s.detail ? `: ${s.detail}` : ""}`), "", `${d.base.replace(/\/+$/, "")}/status`].join("\n"),
    } : { to: COMPANY.email, subject: "Insidir money path working again", text: `Every step passed again: ${steps.map(s => `${s.step} ${s.ms} ms`).join(", ")}.` }).catch(() => "failed" as const);
    if (emailed !== "sent") d.log?.(`money path: email ${emailed} (set RESEND_API_KEY to send it)`);
  }
  await db.insert(monitorRuns).values({ at: new Date(now), ok, failedStep: failed?.step ?? null, detail: failed?.detail ?? null, ms: Date.now() - t0, steps, emailed: emailed === "sent" });
  return { ok, steps, emailed };
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

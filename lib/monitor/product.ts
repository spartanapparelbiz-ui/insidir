/* The product checks (Block 8), run with the money path every 15 minutes against the live site, after landing, a
 * market, checkout and sign-in (lib/monitor/money-path.ts):
 *   today       a member session (the monitor's own account, usr_monitor) opens / as the member home, /autopilot, /book
 *   search      /api/search finds a market by a team name, and opens a pasted Kalshi link
 *   fresh-bets  the bet poller read Polymarket in the last 2 minutes (a new proven-wallet bet shows within 2 minutes)
 *   autopilot   a fixture buy by the monitor's wallet on a twinned market matches the monitor's rule within 10 seconds,
 *               with that market's Kalshi twin, the side, limit = min(rule max, ask) and the contracts for the stake
 *   exit-ping   the fixture wallet's exit sends "They're getting out" for that match within 10 seconds
 *   freshness   trades, twins and prices were each read within 5 minutes
 * The fixture wallet is tier "pro", so member pings never see it; its rows are deleted after every run. The monitor
 * account has no devices, so nothing is ever pushed to anyone. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isReady } from "@/lib/features";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotRules, DEFAULT_SETTINGS, positionEvents, sessions, users } from "@/lib/db/schema";
import { cleanSpec } from "@/lib/autopilot/rules";
import type { Step } from "./money-path";

export const MONITOR_USER = "usr_monitor";
export const MONITOR_WALLET = "0x" + "e".repeat(36) + "0000";
export const FRESH_MS = 5 * 60_000;
export const BETS_FRESH_MS = 2 * 60_000;
const MATCH_MS = 10_000;

/** The freshness sources /status shows and the monitor checks: the worker job whose last good run dates each. */
export const FRESHNESS: ReadonlyArray<{ key: "trades" | "twins" | "prices"; label: string; job: string }> = [
  { key: "trades", label: "Trades (Polymarket trades)", job: "moves:polymarket" },
  { key: "twins", label: "Kalshi twins", job: "twins:bets" },
  { key: "prices", label: "Prices", job: "markets:info" },
];

export interface Freshness { key: string; label: string; at: number | null; stale: boolean }
export async function freshness(db: Db, now: number): Promise<Freshness[]> {
  const r = await db.execute(sql`select job, last_ok_at from terminal.worker_heartbeats where job in (${sql.join(FRESHNESS.map(f => sql`${f.job}`), sql`, `)})`);
  const at = new Map((r.rows as Array<{ job: string; last_ok_at: string | null }>).map(x => [x.job, x.last_ok_at ? new Date(x.last_ok_at).getTime() : null]));
  return FRESHNESS.map(f => { const t = at.get(f.job) ?? null; return { key: f.key, label: f.label, at: t, stale: t === null || now - t > FRESH_MS }; });
}

export interface ProductDeps {
  base: string; f?: typeof fetch; now?: number;
  /** Kalshi's ask for the YES side of a market now, or null. */
  yesAsk(kalshiId: string): Promise<number | null>;
  sleep?: (ms: number) => Promise<void>;
}

class StepFailed extends Error {}
const must = (cond: unknown, why: string): void => { if (!cond) throw new StepFailed(why); };

/** The monitor's own member account and a fresh 1-hour session for it (the token, for the cookie). */
async function monitorSession(db: Db, now: number): Promise<string> {
  await db.insert(users).values({ id: MONITOR_USER, plan: "insidir", membershipStatus: "active", settings: DEFAULT_SETTINGS, onboardedAt: new Date(now), ageConfirmedAt: new Date(now) })
    .onConflictDoUpdate({ target: users.id, set: { plan: "insidir", membershipStatus: "active", accessUntil: null } });
  await db.execute(sql`delete from terminal.sessions where user_id = ${MONITOR_USER}`);
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: MONITOR_USER, expiresAt: new Date(now + 3_600_000) });
  return token;
}

/** The monitor's rule: only its own wallet, any market, almost any price. */
async function monitorRule(db: Db): Promise<number> {
  const spec = cleanSpec({ wallets: { from: "followed", follow: [MONITOR_WALLET], minSettled: 30 }, triggers: { minBet: 5_000 }, price: { max: 0.99, maxMoveCents: 50 },
    stake: { perBet: 10, daily: 1_000_000, weekly: 1_000_000 } });
  const have = (await db.execute(sql`select id from terminal.autopilot_rules where user_id = ${MONITOR_USER} limit 1`)).rows[0] as { id: number } | undefined;
  if (have) { await db.update(autopilotRules).set({ spec, active: true }).where(sql`id = ${have.id}`); return have.id; }
  const [r] = await db.insert(autopilotRules).values({ userId: MONITOR_USER, name: "Monitor", spec }).returning({ id: autopilotRules.id });
  return r!.id;
}

async function cleanup(db: Db): Promise<void> {
  await db.execute(sql`delete from terminal.position_events where wallet = ${MONITOR_WALLET}`);
  await db.execute(sql`delete from terminal.autopilot_matches where user_id = ${MONITOR_USER}`);
  await db.execute(sql`delete from terminal.alerts_sent where user_id = ${MONITOR_USER}`);
}

export async function runProduct(db: Db, d: ProductDeps): Promise<Step[]> {
  const f = d.f ?? fetch, base = d.base.replace(/\/+$/, ""), now = d.now ?? Date.now();
  const sleep = d.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const steps: Step[] = [];
  const run = async (step: Step["step"], fn: () => Promise<void>): Promise<boolean> => {
    const t0 = Date.now();
    try { await fn(); steps.push({ step, ok: true, ms: Date.now() - t0 }); return true; }
    catch (e) { steps.push({ step, ok: false, ms: Date.now() - t0, detail: (e instanceof StepFailed ? e.message : `request failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300) }); return false; }
  };
  const poll = async <T>(fn: () => Promise<T | null>, ms: number): Promise<T | null> => {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(500); }
  };

  await run("today", async () => {
    const token = await monitorSession(db, now);
    const get = (p: string) => f(base + p, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { cookie: `insidir_session=${token}`, "user-agent": "InsidirMonitor/1" } });
    const home = await get("/");
    must(home.status === 200 && (await home.text()).includes('data-testid="member-home"'), `a member's / answered ${home.status} without the member home`);
    for (const p of [...(isReady("autopilot") ? ["/autopilot"] : []), "/book"]) { const r = await get(p); must(r.status === 200, `a member's ${p} answered ${r.status}`); }
  });

  await run("search", async () => {
    const pick = (await db.execute(sql`select b.outcome, t.kalshi_url from terminal.millionaire_bets b join terminal.market_twins t on t.polymarket_id = b.market_id and t.status = 'approved'
      where b.outcome not in ('Yes', 'No') order by (t.kalshi_id like '%GAME-%') desc, b.at desc limit 1`)).rows[0] as { outcome: string; kalshi_url: string } | undefined;
    must(pick, "no recent trade on a twinned market to search for");
    const q = async (s: string) => (await (await f(`${base}/api/search?q=${encodeURIComponent(s)}`, { signal: AbortSignal.timeout(15_000) })).json()) as { go: unknown; hits: unknown[] };
    must((await q(pick!.outcome)).hits.length > 0, `searching "${pick!.outcome}" found nothing`);
    // A link to one Kalshi market opens its page; a link to an event with several twinned lines lists them.
    const k = await q(pick!.kalshi_url);
    must(k.go || k.hits.length > 0, `a pasted Kalshi link (${pick!.kalshi_url}) found nothing`);
  });

  await run("fresh-bets", async () => {
    const r = (await db.execute(sql`select last_ok_at from terminal.worker_heartbeats where job = 'moves:polymarket'`)).rows[0] as { last_ok_at: string | null } | undefined;
    const at = r?.last_ok_at ? new Date(r.last_ok_at).getTime() : null;
    must(at !== null && now - at <= BETS_FRESH_MS, at === null ? "the trade poller has never read Polymarket" : `the trade poller last read Polymarket ${Math.round((now - at) / 1000)}s ago`);
  });

  let matchId: number | null = null, eventAt = 0;
  const twin = (await db.execute(sql`select polymarket_id, kalshi_id from terminal.market_twins where status = 'approved' and (kalshi_close is null or kalshi_close > now() + interval '2 hours')
    order by updated_at desc limit 10`)).rows as Array<{ polymarket_id: string; kalshi_id: string }>;
  try {
    // Autopilot (and its exit ping) is checked only while it is switched on (lib/features.ts).
    const okAuto = isReady("autopilot") && await run("autopilot", async () => {
      await cleanup(db);
      const ruleId = await monitorRule(db);
      await db.execute(sql`insert into terminal.trader_records (wallet, resolved, won, lost, profit, biggest_win, updated_at) values (${MONITOR_WALLET}, 40, 20, 20, 0, 0, now())
        on conflict (wallet) do update set resolved = 40, updated_at = now()`);
      let t: { polymarket_id: string; kalshi_id: string } | undefined, ask: number | null = null;
      for (const c of twin) { ask = await d.yesAsk(c.kalshi_id).catch(() => null); if (ask !== null && ask >= 0.03 && ask <= 0.97) { t = c; break; } }
      must(t, "no approved twin with a Kalshi offer to test against");
      const id = `monitor:${randomUUID()}`; eventAt = Date.now();
      await db.insert(positionEvents).values({ id, wallet: MONITOR_WALLET, tier: "pro", marketId: t!.polymarket_id, outcomeSide: "yes", outcome: "Monitor", marketTitle: "Monitor check", eventTitle: "Monitor check",
        category: "world", url: null, kind: "open", amount: 10_000, price: ask!, shares: 10_000 / ask!, heldAfter: 10_000 / ask!, at: new Date(eventAt), lastAt: new Date(eventAt) });
      const m = await poll(async () => (await db.execute(sql`select id, status, kalshi_id, side, ask, limit_price, contracts, matched_at from terminal.autopilot_matches where rule_id = ${ruleId} and event_id = ${id}`)).rows[0] as
        { id: number; status: string; kalshi_id: string; side: string; ask: number | null; limit_price: number | null; contracts: number | null; matched_at: string } | undefined ?? null, MATCH_MS);
      must(m, "no Autopilot match within 10 seconds of the trade");
      const took = new Date(m!.matched_at).getTime() - eventAt;
      must(took <= MATCH_MS, `the match took ${Math.round(took / 1000)}s`);
      must(m!.status === "sent", `the match was ${m!.status}, not sent`);
      must(m!.kalshi_id === t!.kalshi_id && m!.side === "yes", `the ticket names ${m!.kalshi_id} ${m!.side}, not ${t!.kalshi_id} yes`);
      const limit = Math.round(Math.min(0.99, Number(m!.ask)) * 100) / 100;
      must(Number(m!.limit_price) === limit, `the limit is ${m!.limit_price}, not min(99¢, ask ${m!.ask})`);
      must(Number(m!.contracts) === Math.floor(10 / limit + 1e-9), `${m!.contracts} contracts for $10 at ${limit}`);
      matchId = m!.id;
    });
    if (okAuto) await run("exit-ping", async () => {
      const id = `monitor:${randomUUID()}:exit`;
      const at = Math.max(Date.now(), eventAt + 1);
      const ev = (await db.execute(sql`select market_id from terminal.autopilot_matches where id = ${matchId}`)).rows[0] as { market_id: string };
      await db.insert(positionEvents).values({ id, wallet: MONITOR_WALLET, tier: "pro", marketId: ev.market_id, outcomeSide: "yes", outcome: "Monitor", marketTitle: "Monitor check", eventTitle: "Monitor check",
        category: "world", url: null, kind: "exit", amount: 10_000, price: 0.5, shares: 20_000, heldAfter: 0, at: new Date(at), lastAt: new Date(at) });
      const sent = await poll(async () => ((await db.execute(sql`select 1 from terminal.alerts_sent where user_id = ${MONITOR_USER} and opp_id = ${`apx:${matchId}:${id}`}`)).rowCount ? true : null), MATCH_MS);
      must(sent, "no exit signal within 10 seconds of the exit");
    });
  } finally {
    await cleanup(db).catch(() => undefined);
  }

  await run("freshness", async () => {
    const stale = (await freshness(db, Date.now())).filter(x => x.stale);
    must(!stale.length, `stale over 5 minutes: ${stale.map(x => `${x.label} (${x.at === null ? "never read" : `${Math.round((Date.now() - x.at) / 60_000)} min`})`).join(", ")}`);
  });
  return steps;
}

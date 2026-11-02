/* Millionaire pings, the database side (the rules are in ./pings-pure.ts). The worker runs pingsOnce every minute:
 * new bets of PING_MIN+ from $1M+ wallets (the board, ./board.ts), the paid members with push on and a device, each
 * member's ping categories and today's count; each ping is claimed in terminal.millionaire_pings before it is sent,
 * so a member never gets the same bet twice and the daily cap holds across worker restarts. Server only. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { millionairePings } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";
import { dropPush, pushTargets } from "@/lib/worker/store";
import { moveAlertUsers } from "@/lib/moves/alert-store";
import { inQuietHours } from "@/lib/alerts/quiet";
import { sendPush } from "@/lib/alerts/send";
import { boardRows } from "./board";
import { dayET, PING_MAX_AGE_MS, PING_MIN, pingCatsOf, pingJobs, pingText } from "./pings-pure";

export async function pingsOnce(db: Db, now: number, send: typeof sendPush = sendPush): Promise<number> {
  const bets = await boardRows(db, now, { min: PING_MIN, limit: 50, tier: "millionaire" });
  const fresh = bets.filter(b => now - b.at <= PING_MAX_AGE_MS);
  if (!fresh.length) return 0;
  const users = (await moveAlertUsers(db)).filter(u => u.push);
  if (!users.length) return 0;
  const day = dayET(now);
  const counts = new Map((await db.select({ userId: millionairePings.userId, n: sql<number>`count(*)::int` }).from(millionairePings)
    .where(and(eq(millionairePings.day, day), inArray(millionairePings.userId, users.map(u => u.id)))).groupBy(millionairePings.userId)).map(r => [r.userId, Number(r.n)]));
  const settings = new Map((await db.execute(sql`select id, settings from terminal.users where id in (${sql.join(users.map(u => sql`${u.id}`), sql`, `)})`)).rows
    .map(r => [String((r as { id: string }).id), (r as { settings: { pingCats?: string[]; betOn?: string[] } }).settings ?? {}]));
  const jobs = pingJobs(users.map(u => ({ id: u.id, cats: pingCatsOf(settings.get(u.id) ?? {}), sentToday: counts.get(u.id) ?? 0, quiet: inQuietHours(now, u.quietStart, u.quietEnd, u.timeZone) })),
    fresh.map(b => ({ moveId: b.id, cat: b.cat, amount: b.amount, at: b.at })), now);
  const byId = new Map(fresh.map(b => [b.id, b]));
  let sent = 0;
  for (const j of jobs) {
    const b = byId.get(j.moveId)!;
    // Claim first: a second worker (or a restart) never sends it again.
    const claimed = await db.insert(millionairePings).values({ userId: j.userId, moveId: j.moveId, day, sentAt: new Date(now) }).onConflictDoNothing().returning();
    if (!claimed.length) continue;
    const msg = { ...pingText(b), url: `${appUrl()}/board?ping=${encodeURIComponent(b.id)}` };
    for (const t of await pushTargets(db, j.userId)) {
      const r = await send(t, msg);
      if (r === "gone") await dropPush(db, t.endpoint);
      if (r === "sent") sent++;
    }
  }
  return sent;
}

/** Every pinged bet's outcome, each bet once however many members got it: won / lost once its market settled. */
export async function pingReceipts(db: Db): Promise<{ won: number; lost: number; open: number }> {
  const r = await db.execute(sql`select
      count(*) filter (where m.result = 'won')::int as won, count(*) filter (where m.result = 'lost')::int as lost,
      count(*) filter (where m.result is null)::int as open
    from (select distinct move_id from terminal.millionaire_pings) p join terminal.millionaire_bets m on m.id = p.move_id`);
  const x = r.rows[0] as { won: number; lost: number; open: number } | undefined;
  return { won: Number(x?.won ?? 0), lost: Number(x?.lost ?? 0), open: Number(x?.open ?? 0) };
}

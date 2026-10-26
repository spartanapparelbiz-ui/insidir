/* The database side of move alerts and the daily email: who can be alerted, and what each email lists. Server only. */
import { and, desc, gte, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { DEFAULT_SETTINGS, follows, moves, pushSubscriptions, users } from "@/lib/db/schema";
import type { AlertUser } from "./alerts";
import { movePlan } from "./gate";
import { isTopTrader } from "./records";
import { fromRow, recordsFor } from "./store";
import type { Move } from "./types";

export interface MoveAlertUser extends AlertUser { emailDigest: boolean; lastDigestAt: number | null }

/** Paid members (Free gets no alerts), with what they follow and their alert settings. */
export async function moveAlertUsers(db: Db): Promise<MoveAlertUser[]> {
  const rows = (await db.select().from(users)).filter(u => movePlan(u.plan).alerts);
  if (!rows.length) return [];
  const ids = rows.map(u => u.id);
  const fs = await db.select().from(follows).where(inArray(follows.userId, ids));
  const subs = new Set((await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids))).map(s => s.userId));
  return rows.map(u => {
    const s = { ...DEFAULT_SETTINGS, ...u.settings };
    const mine = fs.filter(f => f.userId === u.id && (f.push || f.email));
    return {
      id: u.id, plan: u.plan, email: u.email, push: s.alertPush && subs.has(u.id), emailOn: s.alertEmail,
      quietStart: s.quietStart, quietEnd: s.quietEnd, timeZone: s.timeZone,
      traders: new Set(mine.filter(f => f.kind === "trader").map(f => f.target)),
      markets: new Set(mine.filter(f => f.kind === "market").map(f => f.target)),
      rules: (s.moveRules ?? []).map(r => ({ tab: r.tab, league: r.league as AlertUser["rules"][number]["league"], min: r.min })),
      emailDigest: s.emailDigest, lastDigestAt: u.lastDigestAt?.getTime() ?? null,
    };
  });
}

/** Moves first seen since `since` (the alert window). */
export async function recentMoves(db: Db, since: Date): Promise<Move[]> {
  return (await db.select().from(moves).where(and(gte(moves.at, since), inArray(moves.tab, liveTabs()))).orderBy(desc(moves.at)).limit(500)).map(fromRow);
}

/** The daily email's two lists: the biggest moves of the last 24h, and top-trader moves settled in the last 24h. */
export async function dailyLists(db: Db, now: number) {
  const since = new Date(now - 86_400_000);
  const top = (await db.select().from(moves).where(and(gte(moves.at, since), inArray(moves.tab, liveTabs()))).orderBy(desc(moves.amount)).limit(5)).map(fromRow);
  const settledAll = (await db.select().from(moves).where(and(isNotNull(moves.result), gte(moves.settledAt, since))).orderBy(desc(moves.amount)).limit(200)).map(fromRow);
  const records = await recordsFor(db, [...top, ...settledAll].map(m => m.wallet ?? ""));
  const settled = settledAll.filter(m => m.wallet && isTopTrader(records.get(m.wallet) ?? null));
  return { top, settled, records };
}


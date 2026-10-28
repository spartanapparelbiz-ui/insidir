/* Trader pictures in the database (terminal.trader_avatars; the rules are in ./avatar.ts). Server only. */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { traderAvatars } from "@/lib/db/schema";
import { AVATAR_STALE_MS, safeAvatarUrl, shownAvatar } from "./avatar";

/** What Polymarket's profile said on one read: the picture (already checked by profileAvatar) and whether the username
 *  is blocked. An admin's hide stays put. */
export async function saveAvatar(db: Db, wallet: string, v: { url: string | null; blocked: boolean }, now: number): Promise<void> {
  const set = { url: v.blocked ? null : safeAvatarUrl(v.url), blocked: v.blocked, checkedAt: new Date(now) };
  await db.insert(traderAvatars).values({ wallet: wallet.toLowerCase(), ...set }).onConflictDoUpdate({ target: traderAvatars.wallet, set });
}

/** The pictures that may be shown for these wallets (wallet → URL). Wallets without one are left out. */
export async function avatarsFor(db: Db, wallets: readonly string[]): Promise<Map<string, string>> {
  const ws = [...new Set(wallets.filter(Boolean).map(w => w.toLowerCase()))];
  if (!ws.length) return new Map();
  const rs = await db.select().from(traderAvatars).where(and(inArray(traderAvatars.wallet, ws), isNotNull(traderAvatars.url)));
  const out = new Map<string, string>();
  for (const r of rs) {
    const src = shownAvatar(r);
    if (src) out.set(r.wallet, src);
  }
  return out;
}

/** avatarsFor that never fails a page: no picture is always a fine answer. */
export const avatarsOrNone = (db: Db | null, wallets: readonly string[]): Promise<Map<string, string>> =>
  db ? avatarsFor(db, wallets).catch(() => new Map()) : Promise.resolve(new Map());

/** Wallets whose picture is missing or a day old: those seen moving in the last 30 days, the leaderboard's and those
 *  with a record. Never-read ones first. */
export async function walletsDueForAvatar(db: Db, now: number, limit: number): Promise<string[]> {
  const r = await db.execute(sql`select w.wallet from (
      select distinct m.wallet from terminal.moves m where m.wallet is not null and m.at > ${new Date(now - 30 * 86_400_000)}
      union select tw.wallet from terminal.tracked_wallets tw
      union select t.wallet from terminal.trader_records t
    ) w left join terminal.trader_avatars a on a.wallet = w.wallet
    where a.wallet is null or a.checked_at < ${new Date(now - AVATAR_STALE_MS)}
    order by a.checked_at asc nulls first limit ${limit}`);
  return (r.rows as Array<{ wallet: string }>).map(x => x.wallet);
}

/** /admin's Hide picture / Show picture. Hiding a wallet never read yet still sticks: the row is made now. */
export async function setAvatarHidden(db: Db, wallet: string, hidden: boolean, now: number): Promise<void> {
  const w = wallet.toLowerCase();
  if (hidden) {
    await db.insert(traderAvatars).values({ wallet: w, url: null, blocked: false, checkedAt: new Date(0), hiddenAt: new Date(now) })
      .onConflictDoUpdate({ target: traderAvatars.wallet, set: { hiddenAt: new Date(now) } });
  } else {
    await db.update(traderAvatars).set({ hiddenAt: null }).where(eq(traderAvatars.wallet, w));
  }
}

export interface AdminAvatar { wallet: string; url: string; hiddenAt: number | null; checkedAt: number }

/** /admin: every stored picture, hidden ones first, then the most recently read. */
export async function adminAvatars(db: Db, limit = 300): Promise<AdminAvatar[]> {
  const rs = await db.select().from(traderAvatars).where(and(isNotNull(traderAvatars.url), eq(traderAvatars.blocked, false)))
    .orderBy(sql`${traderAvatars.hiddenAt} is null`, desc(traderAvatars.checkedAt)).limit(limit);
  return rs.flatMap(r => {
    const url = safeAvatarUrl(r.url);
    return url ? [{ wallet: r.wallet, url, hiddenAt: r.hiddenAt?.getTime() ?? null, checkedAt: r.checkedAt.getTime() }] : [];
  });
}

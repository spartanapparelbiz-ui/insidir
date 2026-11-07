/* Deleting an account (/settings → Delete account, app/auth/delete): the user row goes, and with it (ON DELETE CASCADE)
 * their sessions, push subscriptions and follows. Every other row tied to the account is removed here too: alerts
 * sent, lifecycle notices, bet checks, Research questions, Reads and the markets they've seen, their logged copies
 * (the Book), and their Autopilot rules and matches. A cancel reason stays only as a count: the account and the
 * membership are taken off it, and so is anything they typed. Usage events stay, with the user id cleared, so they're
 * tied to the visitor id only. One transaction: all of it or none. Whop is separate: deleting here cancels nothing
 * there (app/security says so). */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { alertsSent, autopilotMatches, autopilotRules, betChecks, betCopies, cancelReasons, events, lifecycleEmails, reads, readSeen, researchQueries, users } from "@/lib/db/schema";

/** What a cancel reason's account becomes once the account is deleted. */
export const DELETED_USER = "deleted";

export async function deleteAccount(db: Db, userId: string): Promise<boolean> {
  return db.transaction(async tx => {
    await tx.delete(alertsSent).where(eq(alertsSent.userId, userId));
    await tx.delete(lifecycleEmails).where(eq(lifecycleEmails.userId, userId));
    await tx.delete(betChecks).where(eq(betChecks.userId, userId));
    await tx.delete(researchQueries).where(eq(researchQueries.userId, userId));
    await tx.delete(reads).where(eq(reads.userId, userId));
    await tx.delete(readSeen).where(eq(readSeen.userId, userId));
    await tx.delete(betCopies).where(eq(betCopies.userId, userId));
    await tx.delete(autopilotMatches).where(eq(autopilotMatches.userId, userId));
    await tx.delete(autopilotRules).where(eq(autopilotRules.userId, userId));
    await tx.update(cancelReasons).set({ userId: DELETED_USER, membershipId: null, detail: null }).where(eq(cancelReasons.userId, userId));
    await tx.update(events).set({ userId: null }).where(eq(events.userId, userId));
    const gone = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    return gone.length > 0;
  });
}

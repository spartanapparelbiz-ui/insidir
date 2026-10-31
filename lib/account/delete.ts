/* Deleting an account (/settings → Delete account, app/auth/delete): the user row goes, and with it (ON DELETE CASCADE)
 * their sessions, push subscriptions and follows. Rows without a foreign key are removed here too: alerts sent,
 * lifecycle emails, bet checks. Usage events stay, with the user id cleared, so they're tied to the visitor id only.
 * One transaction: all of it or none. Whop is separate: deleting here cancels nothing there (app/security says so). */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { alertsSent, betChecks, events, lifecycleEmails, users } from "@/lib/db/schema";

export async function deleteAccount(db: Db, userId: string): Promise<boolean> {
  return db.transaction(async tx => {
    await tx.delete(alertsSent).where(eq(alertsSent.userId, userId));
    await tx.delete(lifecycleEmails).where(eq(lifecycleEmails.userId, userId));
    await tx.delete(betChecks).where(eq(betChecks.userId, userId));
    await tx.update(events).set({ userId: null }).where(eq(events.userId, userId));
    const gone = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    return gone.length > 0;
  });
}

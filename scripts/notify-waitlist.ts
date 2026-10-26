/* Emails a feature's waitlist once it goes live (docs/INSIDIR-V2.md §2): "[Feature] is live on Insidir."
 *   DATABASE_URL=... RESEND_API_KEY=... EMAIL_FROM=... npx tsx scripts/notify-waitlist.ts <feature> [--dry]
 * Refuses unless the feature is in FEATURES_READY (remove its badge in the same deploy first). Each address gets it
 * once: notified_at is set after a successful send, so a rerun only picks up the rest. */
import { and, eq, isNull } from "drizzle-orm";
import { renderEmail, sendEmail, unsubscribeSig } from "@/lib/alerts/send";
import { appUrl } from "@/lib/auth/whop";
import { closeDb, getDb } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { FEATURES, isReady, type Feature } from "@/lib/features";
import { liveEmail } from "@/lib/moves/waitlist";

const feature = process.argv[2] as Feature | undefined;
const dry = process.argv.includes("--dry");

async function main() {
  if (!feature || !Object.hasOwn(FEATURES, feature)) throw new Error(`Name a feature: ${Object.keys(FEATURES).join(", ")}`);
  if (!isReady(feature)) throw new Error(`${feature} isn't in FEATURES_READY yet. Make it live first.`);
  const db = getDb();
  const rows = await db.select().from(waitlist).where(and(eq(waitlist.feature, feature), isNull(waitlist.notifiedAt)));
  const e = liveEmail(feature, appUrl());
  let sent = 0;
  for (const r of rows) {
    if (dry) { console.log("would email", r.email); continue; }
    // The waitlist has no account behind it, so the "unsubscribe" link removes the address from this list.
    const unsub = `${appUrl()}/api/waitlist?remove=${encodeURIComponent(r.email)}&feature=${feature}&s=${unsubscribeSig(`waitlist:${r.email}`)}`;
    const ok = await sendEmail({ to: r.email, subject: e.subject, ...renderEmail({ heading: e.subject, lines: e.lines, cta: e.cta, unsubscribe: unsub }), unsubscribe: unsub });
    if (ok === "sent" || ok === "gone") await db.update(waitlist).set({ notifiedAt: new Date() }).where(and(eq(waitlist.email, r.email), eq(waitlist.feature, feature)));
    if (ok === "sent") sent++;
  }
  console.log(`${feature}: ${dry ? rows.length + " to email (dry run)" : `${sent} of ${rows.length} emailed`}`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeDb());

/* An alert was opened: marks it, records the first "alert_opened" funnel event, and goes to the deal. */
import { appUrl } from "@/lib/whop/config";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { alertsSent } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const opp = req.nextUrl.searchParams.get("opp") ?? "";
  const ch = req.nextUrl.searchParams.get("ch") === "email" ? "email" : "push";
  const to = new URL(`/deal/${encodeURIComponent(opp)}`, appUrl());
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user && opp) {
    const opened = await getDb().update(alertsSent).set({ openedAt: new Date() })
      .where(and(eq(alertsSent.userId, user.id), eq(alertsSent.oppId, opp), eq(alertsSent.channel, ch), isNull(alertsSent.openedAt))).returning({ oppId: alertsSent.oppId }).catch(() => []);
    if (opened.length) await recordEvent({ name: "alert_opened", userId: user.id, visitorId: req.cookies.get("insidir_vid")?.value, props: { ch } }).catch(() => undefined);
  }
  return NextResponse.redirect(to, 303);
}

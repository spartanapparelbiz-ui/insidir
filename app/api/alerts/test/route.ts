/* "Send test alert": a real push to every device this member turned alerts on for (the same send path as real
 * alerts), or a test email when email is their channel. The answer says exactly what happened, in plain words. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { appUrl } from "@/lib/app-url";
import { getDb } from "@/lib/db";
import { sendPush } from "@/lib/alerts/send";
import { movePlan } from "@/lib/moves/gate";
import { dropPush, pushTargets } from "@/lib/worker/store";

export const dynamic = "force-dynamic";

const TEST = { title: "Test alert from Insidir", body: "Alerts work on this device. A real alert says who moved, how much, and on what." };

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first, then try again." }, { status: 401 });
  if (!movePlan(user.plan).alerts) return NextResponse.json({ error: "Alerts come with Insidir and Pro." }, { status: 403 });
  const db = getDb();
  const targets = await pushTargets(db, user.id);
  if (targets.length) {
    let sent = 0, gone = 0;
    for (const t of targets) {
      const r = await sendPush(t, { ...TEST, url: `${appUrl()}/alerts` });
      if (r === "sent") sent++;
      else if (r === "gone") { gone++; await dropPush(db, t.endpoint); }
    }
    if (sent) return NextResponse.json({ ok: true, sent, message: `Test alert sent to ${sent} ${sent === 1 ? "device" : "devices"}` });
    if (gone === targets.length) return NextResponse.json({ error: "This device's alert permission expired. Turn alerts off and on again, then retry." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't reach the push service. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ error: "No device has alerts on. Turn on alerts first." }, { status: 409 });
}

/* Step 2 of log-in: the email and its 6-digit code → a 30-day session cookie (lib/auth/login.ts). */
import { NextResponse, type NextRequest } from "next/server";
import { safeNext, verifyCode } from "@/lib/auth/login";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordEvent } from "@/lib/analytics";
import { getDb, hasDatabase } from "@/lib/db";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable", message: "Log-in is unavailable right now." }, { status: 503 });
  const { email = "", code = "", next } = await readBody(req);
  const r = await verifyCode(getDb(), email, code);
  if (!r.ok) {
    const message = r.reason === "wrong" ? `That code isn't right. ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} left.`
      : r.reason === "locked" ? "Too many wrong tries. Ask for a new code."
      : r.reason === "expired" ? "That code has expired. Ask for a new one."
      : r.reason === "no_plan" ? "No active plan for this email. Get Insidir · $39/mo."
      : "Type the 6-digit code from the email.";
    return NextResponse.json({ error: r.reason, message, triesLeft: r.triesLeft }, { status: r.reason === "no_plan" ? 403 : 400 });
  }
  const { token, expires } = await createSession(r.userId);
  void recordEvent({ name: "login", userId: r.userId }).catch(() => undefined);
  const res = NextResponse.json({ ok: true, next: safeNext(next) });
  setSessionCookie(res, token, expires);
  return res;
}

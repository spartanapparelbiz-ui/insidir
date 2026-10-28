/* Log in to Insidir: email and password → a 30-day session cookie (lib/auth/password.ts). Members only. */
import { NextResponse, type NextRequest } from "next/server";
import { logIn, safeNext } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordEvent } from "@/lib/analytics";
import { getDb, hasDatabase } from "@/lib/db";
import { clientIp, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const MESSAGE = {
  invalid: "Type your email and password.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
  wrong: "That email and password don't match.",
  no_password: "This account signs in with Google. Tap \"Continue with Google\".",
  no_plan: "No active plan for this email. Try 7 days for $1, then $39/mo.",
} as const;

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable", message: "Log-in is unavailable right now." }, { status: 503 });
  const { email = "", password = "", next } = await readBody(req);
  const r = await logIn(getDb(), email, password, clientIp(req));
  if (!r.ok) {
    const status = r.reason === "rate_limited" ? 429 : r.reason === "no_plan" ? 403 : r.reason === "invalid" ? 400 : 401;
    return NextResponse.json({ error: r.reason, message: MESSAGE[r.reason] }, { status });
  }
  const { token, expires } = await createSession(r.userId);
  void recordEvent({ name: "login", userId: r.userId }).catch(() => undefined);
  const res = NextResponse.json({ ok: true, next: safeNext(next) });
  setSessionCookie(res, token, expires);
  return res;
}

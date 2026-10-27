/* Step 1 of log-in: an email in, a 6-digit code out by email (lib/auth/login.ts). Members only. */
import { NextResponse, type NextRequest } from "next/server";
import { requestCode } from "@/lib/auth/login";
import { getDb, hasDatabase } from "@/lib/db";
import { clientIp, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const MESSAGE = {
  invalid: "That doesn't look like an email address.",
  rate_limited: "Too many codes asked for. Wait a few minutes and try again.",
  no_plan: "No active plan for this email. Get Insidir · $39/mo.",
  send_failed: "We couldn't send the email just now. Try again in a minute.",
} as const;

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable", message: MESSAGE.send_failed }, { status: 503 });
  const { email = "" } = await readBody(req);
  const r = await requestCode(getDb(), email, clientIp(req));
  if (r.ok) return NextResponse.json({ ok: true });
  const status = r.reason === "rate_limited" ? 429 : r.reason === "no_plan" ? 403 : r.reason === "invalid" ? 400 : 502;
  return NextResponse.json({ error: r.reason, message: MESSAGE[r.reason] }, { status });
}

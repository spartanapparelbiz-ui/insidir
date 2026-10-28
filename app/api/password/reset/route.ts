/* Sets the new password after "Confirm it's you" (/reset): uses the one-time reset token, ends every other session,
 * and logs this browser in. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { passwordProblem, setPassword } from "@/lib/auth/password";
import { RESET_COOKIE, useReset } from "@/lib/auth/reset";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password = "" } = await readBody(req);
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: "weak", message: problem }, { status: 400 });
  const db = getDb();
  const token = req.cookies.get(RESET_COOKIE)?.value;
  const userId = token ? await useReset(db, token) : null;
  if (!userId) return NextResponse.json({ error: "expired", message: "That took too long. Tap \"Confirm it's you\" again." }, { status: 401 });
  await setPassword(db, userId, password);
  await db.delete(sessions).where(eq(sessions.userId, userId));
  const { token: s, expires } = await createSession(userId);
  const res = NextResponse.json({ ok: true, next: "/feed" });
  setSessionCookie(res, s, expires);
  res.cookies.delete(RESET_COOKIE);
  return res;
}

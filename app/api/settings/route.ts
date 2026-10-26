/* Saves the signed-in user's settings (JSON or a form post). Form posts come back to /settings; JSON gets JSON.
 * Unknown fields (a bankroll, say) are ignored, never stored. The region also goes in its cookie. */
import { appUrl } from "@/lib/auth/whop";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { REGION_COOKIE, SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { formToInput, parseSettings, type SettingsInput } from "./validate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let input: SettingsInput = {};
  try {
    if (isJson) {
      const body: unknown = await req.json();
      input = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as SettingsInput) : {};
    } else input = formToInput(await req.formData());
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }
  const back = (q: string) => NextResponse.redirect(new URL(`/settings${q}`, appUrl()), 303);
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return isJson ? NextResponse.json({ error: "Sign in first." }, { status: 401 }) : NextResponse.redirect(new URL("/auth/login?next=/settings", appUrl()), 303);

  const r = parseSettings(input, user.settings, user.region, !isJson && input.form === "settings");
  if (r.errors.length) return isJson ? NextResponse.json({ errors: r.errors, ignored: r.ignored }, { status: 400 }) : back(`?error=${encodeURIComponent(r.errors.join(" "))}`);
  // Push and email alerts are paid features; the daily summary is open to everyone.
  if (!isPaid(user.plan)) { r.settings.alertPush = false; r.settings.alertEmail = false; }
  await getDb().update(users).set({ settings: r.settings, region: r.region }).where(eq(users.id, user.id));
  const res = isJson ? NextResponse.json({ ok: true, settings: r.settings, region: r.region, ignored: r.ignored }) : back("?saved=1");
  if (r.region) res.cookies.set(REGION_COOKIE, r.region, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  return res;
}

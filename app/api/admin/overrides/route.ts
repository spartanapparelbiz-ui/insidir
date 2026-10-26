/* Admin match overrides (terminal.match_overrides): force a match (optionally inverted), block a pair, set its
 * safety light, or clear the override. The matcher reads these on its next run. */
import { appUrl } from "@/lib/whop/config";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { matchOverrides } from "@/lib/db/schema";
import type { Safety } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Longest pair key / note accepted. */
const MAX_KEY = 600;
const MAX_NOTE = 500;

export async function POST(req: NextRequest) {
  if (!verifyAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value, Date.now())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "").slice(0, MAX_KEY);
  const action = String(form?.get("action") ?? "");
  const note = String(form?.get("note") ?? "").slice(0, MAX_NOTE) || null;
  const safetyRaw = String(form?.get("safety") ?? "");
  const safety: Safety | null = safetyRaw === "green" || safetyRaw === "yellow" || safetyRaw === "red" ? safetyRaw : null;
  const back = (q: string) => NextResponse.redirect(new URL(`/admin${q}#matches`, appUrl()), 303);
  if (!key || !hasDatabase()) return back("?error=" + encodeURIComponent(!key ? "Missing pair." : "No database."));
  const db = getDb();
  if (action === "clear") {
    await db.delete(matchOverrides).where(eq(matchOverrides.key, key));
    return back("?saved=1");
  }
  if (action !== "match" && action !== "block" && action !== "safety") return back("?error=" + encodeURIComponent("Unknown action."));
  if (action === "safety" && !safety) return back("?error=" + encodeURIComponent("Pick a safety light."));
  const values = { key, action, inverted: action === "match" && form?.get("inverted") === "on", safety: action === "safety" ? safety : null, note, at: new Date() } as const;
  await db.insert(matchOverrides).values(values).onConflictDoUpdate({ target: matchOverrides.key, set: values });
  return back("?saved=1");
}

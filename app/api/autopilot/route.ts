/* POST /api/autopilot: a member's Autopilot rules, from the plain forms on /autopilot (no JavaScript needed).
 *   action=starter key=…          turn on a starter rule
 *   action=save [id] name, fields  create or update a rule (lib/autopilot/rules.ts cleanSpec clamps every field)
 *   action=toggle id               on / off
 *   action=delete id               remove the rule (its log stays with its matches)
 * Redirects back to /autopilot with a notice. Members only. */
import { and, count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { autopilotRules } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { specFromForm } from "@/lib/autopilot/form";
import { MAX_RULES } from "@/lib/autopilot/queries";
import { starter } from "@/lib/autopilot/starters";

export const dynamic = "force-dynamic";

const back = (req: NextRequest, q: string) => NextResponse.redirect(new URL(`/autopilot?${q}`, req.url), 303);
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.redirect(new URL("/login?next=/autopilot", req.url), 303);
  const userId = viewer.user.id, db = getDb();
  const f = await req.formData();
  const action = String(f.get("action") ?? ""), id = Number(f.get("id"));
  const mine = Number.isInteger(id) && id > 0 ? and(eq(autopilotRules.id, id), eq(autopilotRules.userId, userId)) : null;
  const room = async () => ((await db.select({ n: count() }).from(autopilotRules).where(eq(autopilotRules.userId, userId)))[0]?.n ?? 0) < MAX_RULES;

  if (action === "starter") {
    const s = starter(String(f.get("key")));
    if (!s) return back(req, "error=starter");
    const have = await db.select({ id: autopilotRules.id }).from(autopilotRules).where(and(eq(autopilotRules.userId, userId), eq(autopilotRules.starter, s.key)));
    if (have.length) await db.update(autopilotRules).set({ active: true, updatedAt: new Date() }).where(eq(autopilotRules.id, have[0]!.id));
    else if (await room()) await db.insert(autopilotRules).values({ userId, name: s.name, starter: s.key, spec: s.spec });
    else return back(req, "error=full");
    return back(req, `on=${encodeURIComponent(s.key)}`);
  }
  if (action === "save") {
    const name = String(f.get("name") ?? "").trim().slice(0, 60) || "My rule";
    const spec = specFromForm(f);
    if (mine) await db.update(autopilotRules).set({ name, spec, updatedAt: new Date() }).where(mine);
    else if (await room()) await db.insert(autopilotRules).values({ userId, name, spec });
    else return back(req, "error=full");
    return back(req, "saved=1");
  }
  if (action === "toggle" && mine) {
    const r = (await db.select({ active: autopilotRules.active }).from(autopilotRules).where(mine))[0];
    if (r) await db.update(autopilotRules).set({ active: !r.active, updatedAt: new Date() }).where(mine);
    return back(req, "saved=1");
  }
  if (action === "delete" && mine) {
    await db.delete(autopilotRules).where(mine);
    return back(req, "deleted=1");
  }
  return back(req, "error=action");
}

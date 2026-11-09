/* A touch (lib/attribution.ts), logged by middleware.ts after it set the first-touch or last-touch cookie: one "touch"
 * event per visitor per touch, with its source, so visits count per account and per post (/admin/metrics). Server to
 * server only: the header must carry TOUCH_SECRET (else ADMIN_TOKEN). */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { readTouch, TOUCH_KEYS } from "@/lib/attribution";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: NextRequest) {
  const secret = process.env.TOUCH_SECRET || process.env.ADMIN_TOKEN || "";
  if (!secret || !same(req.headers.get("x-insidir-touch") ?? "", secret)) return NextResponse.json({ error: "no" }, { status: 401 });
  let body: { visitorId?: unknown; kind?: unknown; touch?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const vid = typeof body.visitorId === "string" && /^[a-f0-9]{32}$/.test(body.visitorId) ? body.visitorId : null;
  const kind = body.kind === "first" ? "first" : "last";
  const t = readTouch(JSON.stringify(body.touch ?? null));
  if (!vid || !t) return NextResponse.json({ error: "bad touch" }, { status: 400 });
  const props: Record<string, string> = { kind, source: t.source };
  for (const k of TOUCH_KEYS) if (t[k]) props[k] = t[k]!;
  await recordEvent({ name: "touch", visitorId: vid, props, dedupeKey: kind === "first" ? `touch:first:${vid}` : null }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

/* POST /api/follows {kind: "trader"|"market", target}: follow; DELETE: unfollow. Members only (docs/INSIDIR-V2.md §8):
 * Insidir up to 50, Pro unlimited, free none. */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { canFollow } from "@/lib/moves/gate";
import { recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { follow, followList, unfollow } from "@/lib/moves/store";

async function parse(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { kind?: unknown; target?: unknown } | null;
  const kind: "trader" | "market" | null = b?.kind === "trader" ? "trader" : b?.kind === "market" ? "market" : null;
  const target = typeof b?.target === "string" && b.target.length <= 200 ? b.target.toLowerCase().startsWith("0x") ? b.target.toLowerCase() : b.target : null;
  return kind && target ? { kind, target } : null;
}

export async function POST(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only. Get Insidir · $39/mo." }, { status: 401 });
  if (!viewer.user) return NextResponse.json({ error: "Log in to follow traders." }, { status: 401 });
  if (!isReady("follows")) return NextResponse.json({ error: "Following is coming soon." }, { status: 409 });
  const f = await parse(req);
  if (!f) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const db = getDb();
  const mine = await followList(db, viewer.user.id);
  if (!mine.some(x => x.kind === f.kind && x.target === f.target) && !canFollow(viewer.plan, mine.length)) {
    return NextResponse.json({ error: viewer.plan === "free" ? "Following is for members. Try it for $1." : "You're following 50 already. Pro has no limit." }, { status: 403 });
  }
  await follow(db, viewer.user.id, f.kind, f.target);
  // The funnel's "first follow" (lib/analytics.ts FUNNEL): the member's first trader or market.
  if (!mine.length) await recordEvent({ name: "first_follow", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user.id, props: { kind: f.kind } }).catch(() => undefined);
  return NextResponse.json({ ok: true, message: "Following." });
}

export async function DELETE(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only. Get Insidir · $39/mo." }, { status: 401 });
  if (!viewer.user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const f = await parse(req);
  if (!f) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await unfollow(getDb(), viewer.user.id, f.kind, f.target);
  return NextResponse.json({ ok: true, message: "Unfollowed." });
}

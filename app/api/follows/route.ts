/* POST /api/follows {kind, target}: follow; DELETE: unfollow. Kinds (lib/follows.ts): trader (wallet), market,
 * insider (SEC reporting-owner CIK), company (issuer CIK) and fund (13F filer CIK). Members only (docs/INSIDIR-V2.md §8).
 * Following an insider or a company also queues their EDGAR history, so their page fills in. */
import { MEMBERS_ONLY } from "@/lib/copy";
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { parseFollow } from "@/lib/follows";
import { canFollow } from "@/lib/moves/gate";
import { recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { follow, followList, unfollow } from "@/lib/moves/store";
import { queueHistory } from "@/lib/stocks/history";

async function parse(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { kind?: unknown; target?: unknown } | null;
  return parseFollow(b?.kind, b?.target);
}

export async function POST(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  if (!viewer.user) return NextResponse.json({ error: "Log in to follow." }, { status: 401 });
  if (!isReady("follows")) return NextResponse.json({ error: "Following is coming soon." }, { status: 409 });
  const f = await parse(req);
  if (!f) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const db = getDb();
  const mine = await followList(db, viewer.user.id);
  if (!mine.some(x => x.kind === f.kind && x.target === f.target) && !canFollow(viewer.plan, mine.length)) {
    return NextResponse.json({ error: viewer.plan === "free" ? "Following is for members. Try 7 days for $1." : "You're following 50 already. Pro has no limit." }, { status: 403 });
  }
  await follow(db, viewer.user.id, f.kind, f.target);
  if (f.kind === "insider" || f.kind === "company") await queueHistory(db, [{ kind: f.kind === "insider" ? "owner" : "issuer", cik: f.target, name: null }]).catch(() => undefined);
  // The funnel's "first follow" (lib/analytics.ts FUNNEL): the member's first follow of any kind.
  if (!mine.length) await recordEvent({ name: "first_follow", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user.id, props: { kind: f.kind } }).catch(() => undefined);
  return NextResponse.json({ ok: true, message: "Following." });
}

export async function DELETE(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  if (!viewer.user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const f = await parse(req);
  if (!f) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await unfollow(getDb(), viewer.user.id, f.kind, f.target);
  return NextResponse.json({ ok: true, message: "Unfollowed." });
}

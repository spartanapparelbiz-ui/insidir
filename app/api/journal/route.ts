/* POST /api/journal {cik, status, note}: saves a member's research journal entry on a company; DELETE {cik} removes it
 * (lib/journal.ts). Private to the member. Members only, and only while the journal is live. */
import { NextResponse, type NextRequest } from "next/server";
import { MEMBERS_ONLY } from "@/lib/copy";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { deleteEntry, parseEntry, saveEntry } from "@/lib/journal";

async function member() {
  const v = await memberOrNull();
  if (!v?.user) return { res: NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 }) };
  if (!isReady("journal")) return { res: NextResponse.json({ error: "The journal is coming soon." }, { status: 409 }) };
  return { userId: v.user.id };
}

export async function POST(req: NextRequest) {
  const m = await member();
  if ("res" in m) return m.res;
  const e = parseEntry((await req.json().catch(() => null)) as Record<string, unknown> | null);
  if (!e) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await saveEntry(getDb(), m.userId, e);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const m = await member();
  if ("res" in m) return m.res;
  const b = (await req.json().catch(() => null)) as { cik?: unknown } | null;
  const cik = String(b?.cik ?? "");
  if (!/^\d{1,10}$/.test(cik) || Number(cik) <= 0) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await deleteEntry(getDb(), m.userId, String(Number(cik)));
  return NextResponse.json({ ok: true });
}

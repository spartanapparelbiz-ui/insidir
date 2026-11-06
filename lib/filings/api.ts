/* Shared guard for /api/filings routes: members only (checked on the server), and only once the feature is ready
 * (FEATURES_READY includes "filings"). Returns the member's id or the response to send. */
import { NextResponse } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { MEMBERS_ONLY } from "@/lib/copy";
import { isReady } from "@/lib/features";

export async function filingsMember(): Promise<{ userId: string } | NextResponse> {
  if (!isReady("filings")) return NextResponse.json({ error: "Filings is coming soon." }, { status: 404 });
  const v = await memberOrNull();
  if (!v?.user) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  return { userId: v.user.id };
}

export const bad = (message = "Bad request.") => NextResponse.json({ error: message }, { status: 400 });

/** Member data: never cached by a shared cache. */
export const privateJson = (body: unknown, init?: { status?: number; maxAge?: number }) =>
  NextResponse.json(body, { status: init?.status ?? 200, headers: { "Cache-Control": `private, max-age=${init?.maxAge ?? 0}` } });

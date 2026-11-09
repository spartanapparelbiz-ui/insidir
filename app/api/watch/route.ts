/* POST /api/watch (members): "Watch my bet". A form post with action=
 *   add      market (a link, slug or id), side (yes | no), price (cents paid, 1–99), amount (dollars in)
 *   import   address: a public Polymarket address, read-only (no keys): its open positions are added
 *   remove   id: stop watching one
 * and back to /watch with what happened. JSON in, JSON out with ?json=1 or an application/json body. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { memberOrNull } from "@/lib/auth/viewer";
import { GET_CTA } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { addManual, importAddress, removeWatched } from "@/lib/watch/store";

export const dynamic = "force-dynamic";

async function body(req: NextRequest): Promise<Record<string, string>> {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  const f = await req.formData().catch(() => null);
  return f ? Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
}

export async function POST(req: NextRequest) {
  const asJson = req.nextUrl.searchParams.get("json") === "1" || (req.headers.get("content-type") ?? "").includes("application/json");
  const done = (r: { ok?: string; error?: string; id?: string }, status = 200) => asJson
    ? NextResponse.json(r, { status: r.error ? (status === 200 ? 400 : status) : 200 })
    : NextResponse.redirect(new URL(`/watch?${new URLSearchParams(r.error ? { error: r.error } : { ok: r.ok ?? "Done." })}${r.id ? `#${r.id}` : ""}`, appUrl()), 303);
  const viewer = await memberOrNull();
  if (!viewer?.user) return done({ error: `Watching your bets is for members. ${GET_CTA}.` }, 401);
  const b = await body(req), db = getDb(), userId = viewer.user.id;
  if (b.action === "add") {
    const side = b.side === "no" ? "no" : b.side === "yes" ? "yes" : null;
    const cents = Number(b.price), amount = Number(String(b.amount ?? "").replace(/[$,\s]/g, ""));
    if (!side) return done({ error: "Pick the side you bet." });
    const r = await addManual(db, userId, { market: b.market ?? "", side, price: cents > 1 ? cents / 100 : cents, amount });
    return "error" in r ? done({ error: r.error }) : done({ ok: "Watching it. We'll tell you when big money moves on it.", id: r.id });
  }
  if (b.action === "import") {
    const r = await importAddress(db, userId, b.address ?? "");
    if ("error" in r) return done({ error: r.error });
    return done({ ok: r.added + r.updated ? `Watching ${r.added + r.updated} open ${r.added + r.updated === 1 ? "position" : "positions"} from that address (${r.added} new).` : "That address has no open positions right now." });
  }
  if (b.action === "remove") return (await removeWatched(db, userId, b.id ?? "")) ? done({ ok: "Stopped watching it." }) : done({ error: "Not found." }, 404);
  return done({ error: "Bad request." });
}

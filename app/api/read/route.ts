/* POST /api/read: The Read (lib/read). multipart/form-data with one of:
 *   text  a Polymarket or Kalshi link, or a market in plain words ("Senate control", "Lakers tonight")
 *   pick  one of the choices offered before: "polymarket:<id>" or "kalshi:<ticker>"
 *   slip  a sportsbook screenshot (PNG, JPEG, WebP or GIF, up to 8 MB; read and dropped, never stored)
 * Answers { id } (the Read is /read/<id>), { choices: [up to 3] } when it isn't clear which market, or { error, code }.
 * Visitors (and accounts without Insidir) get FREE_READS; members unlimited. Only a Read with proven money or big
 * bets counts toward it, and the markets a "Which one?" offered stay open to pick for 30 minutes. A member's Read carries the analyst line
 * (capped per member per day); a visitor's is written without one (it's blurred for them). Data, never advice. */
import { NextResponse, type NextRequest } from "next/server";
import { unlockHref } from "@/components/app/links";
import { recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { CheckError } from "@/lib/check/extract";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isPaid } from "@/lib/plans";
import { ReadNotFound } from "@/lib/read/build";
import { resolveSlip, resolveText } from "@/lib/read/resolve";
import { cachedRead, FREE_READS, lineFor, readsUsed, saveOffer, saveRead, wasOffered } from "@/lib/read/store";
import type { Resolved } from "@/lib/read/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return fail(503, "unavailable", "Reads aren't available right now.");
  const db = getDb(), t0 = Date.now(), now = t0;
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
  const userId = viewer.user?.id ?? null;
  const who = { userId, visitorId };
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "bad_input", "Paste a Polymarket or Kalshi link, or type a market.");
  const text = String(form.get("text") ?? "").trim().slice(0, 500);
  const pick = String(form.get("pick") ?? "");
  const file = form.get("slip");
  // The free Read: one that shows proven money or big bets. A market offered in a "Which one?" can still be opened:
  // picking is part of that search.
  if (!paid && (await readsUsed(db, who)) >= FREE_READS && !(/^(polymarket|kalshi):/.test(pick) && (await wasOffered(db, who, pick, now)))) {
    return fail(402, "limit", "You've used your free Read. Members read every market.", { unlockHref: unlockHref() });
  }
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  let r: Resolved, input: "link" | "text" | "slip" | "pick";
  try {
    const m = /^(polymarket|kalshi):([A-Za-z0-9._-]{3,120})$/.exec(pick);
    if (m) { r = { kind: "market", venue: m[1] as "polymarket" | "kalshi", id: m[2]! }; input = "pick"; }
    else if (file instanceof File && file.size > 0) {
      if (!TYPES.has(file.type)) return fail(400, "bad_input", "Upload a PNG, JPEG, WebP or GIF screenshot.");
      if (file.size > MAX_BYTES) return fail(400, "bad_input", "That image is over 8 MB. Try a smaller screenshot.");
      r = await resolveSlip(db, clients, { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type as "image/png" }, now);
      input = "slip";
    } else if (text) { r = await resolveText(db, clients, text, now); input = /https?:\/\/|\.com\//i.test(text) ? "link" : "text"; }
    else return fail(400, "bad_input", "Paste a Polymarket or Kalshi link, or type a market.");
  } catch (e) {
    if (e instanceof CheckError) return fail(e.code === "not_configured" || e.code === "budget" ? 503 : 422, e.code, e.message);
    return fail(502, "failed", "Something went wrong reading that. Try again in a minute.");
  }
  if (r.kind === "none") return fail(404, "not_found", r.why);
  if (r.kind === "choices") {
    if (!paid) await saveOffer(db, who, r.list.map(c => `${c.venue}:${c.id}`), now);
    return NextResponse.json({ choices: r.list }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const base = await cachedRead(db, clients, r.venue, r.id, now);
    const line = paid && userId ? await lineFor(db, base, userId, now) : null;
    const data = { ...base, line: line ? { text: line.text, origin: line.origin, model: line.model } : null };
    const ms = Date.now() - t0;
    const id = await saveRead(db, { userId, visitorId: userId ? null : visitorId, input, data, ms }, now);
    void recordEvent({ name: "read", visitorId, userId, props: { ms, input } }).catch(() => undefined);
    return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReadNotFound) return fail(404, "not_found", "We couldn't find that market on Polymarket or Kalshi.");
    return fail(502, "failed", "Something went wrong reading that market. Try again in a minute.");
  }
}

/* POST /api/check: check a bet (lib/check). multipart/form-data with `slip` (a screenshot: PNG, JPEG, WebP or GIF, up to
 * 8 MB) or `text` (a Polymarket / Kalshi link, or a stock ticker). Free viewers get FREE_CHECKS checks (by account,
 * else by the visitor cookie); members unlimited. Returns { id } (the result page is /check/<id>), or { error, code }.
 * The image is read and dropped; it is never stored. Data, not a recommendation. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { unlockHref } from "@/components/app/links";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isPaid } from "@/lib/plans";
import { CheckError, readPasted, readSlip, toLeg } from "@/lib/check/extract";
import { checkLeg, checkLink, checkTicker, checksUsed, FREE_CHECKS, saveCheck, type LegResult } from "@/lib/check/run";
import { checkSpend } from "@/lib/check/spend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_LEGS = 12;

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, code, ...extra }, { status });

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return fail(503, "unavailable", "Checking positions isn't available right now.");
  const db = getDb();
  const now = Date.now();
  const viewer = await getViewer();
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
  const userId = viewer.user?.id ?? null;
  if (!isPaid(viewer.plan) && (await checksUsed(db, { userId, visitorId })) >= FREE_CHECKS) {
    return fail(402, "limit", "You've used your free check. Members check every position.", { unlockHref: unlockHref() });
  }
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "bad_input", "Upload a slip screenshot, or paste a market link or a ticker.");
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  const file = form.get("slip");
  const text = String(form.get("text") ?? "").trim();
  let legs: LegResult[] = [], input: "slip" | "link" | "ticker", book: string | null = null;
  try {
    if (file instanceof File && file.size > 0) {
      if (!TYPES.has(file.type)) return fail(400, "bad_input", "Upload a PNG, JPEG, WebP or GIF screenshot.");
      if (file.size > MAX_BYTES) return fail(400, "bad_input", "That image is over 8 MB. Try a smaller screenshot.");
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      const slip = await readSlip({ data, mediaType: file.type as "image/png" }, checkSpend(db, now));
      input = "slip"; book = slip.book;
      legs = await Promise.all(slip.legs.slice(0, MAX_LEGS).map(l => checkLeg(db, clients, toLeg(l), now)));
    } else if (text) {
      const p = readPasted(text);
      if (!p) return fail(400, "bad_input", "Paste a Polymarket or Kalshi market link, or a stock ticker like NVDA.");
      if (p.kind === "ticker") { input = "ticker"; legs = [await checkTicker(db, p.ticker, now)]; }
      else {
        input = "link";
        const l = await checkLink(db, clients, p, now);
        if (!l) return fail(404, "not_found", "We couldn't find that market. Check the link and try again.");
        legs = [l];
      }
    } else return fail(400, "bad_input", "Upload a slip screenshot, or paste a market link or a ticker.");
  } catch (e) {
    if (e instanceof CheckError) return fail(e.code === "not_configured" || e.code === "budget" ? 503 : 422, e.code, e.message);
    return fail(502, "failed", "Something went wrong reading that. Try again in a minute.");
  }
  const c = await saveCheck(db, { input, book, legs, userId, visitorId: userId ? null : visitorId }, now);
  return NextResponse.json({ id: c.id }, { headers: { "Cache-Control": "no-store" } });
}

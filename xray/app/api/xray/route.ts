/* GET /api/xray?u=<Polymarket link> — the X-ray as JSON, for the Chrome extension. Redacted on the server for
 * non-members exactly like the pages (lib/access.ts). */
import { NextResponse, type NextRequest } from "next/server";
import { forViewer, MEMBER_COOKIE } from "@/lib/access";
import { parseLink, targetPath } from "@/lib/link";
import { resolveTarget } from "@/lib/resolve";
import { xray } from "@/lib/xray";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, max-age=30" } });

export async function GET(req: NextRequest) {
  const t = parseLink(req.nextUrl.searchParams.get("u") ?? "");
  if (!t) return json({ error: "Not a Polymarket link" }, 400);
  let r;
  try { r = await resolveTarget(t); } catch { return json({ error: "Polymarket didn't answer" }, 502); }
  if (!r) return json({ error: "No market found" }, 404);
  if (r.type === "list") {
    return json({
      type: "list",
      event: { slug: r.event.slug, title: r.event.title },
      markets: r.markets.map(m => ({ slug: m.slug, question: m.question, title: m.groupItemTitle ?? m.question, outcomes: m.outcomes, prices: m.prices,
        volume: m.volume, closed: m.closed, path: targetPath({ kind: "event", slug: r.event.slug, market: m.slug }) })),
    });
  }
  try {
    const x = forViewer(await xray(r.market), req.cookies.get(MEMBER_COOKIE)?.value);
    return json({ type: "xray", path: targetPath(t), xray: x });
  } catch {
    return json({ error: "Polymarket didn't answer" }, 502);
  }
}

/* GET /check/<id>/card: the checked bet as a 1080×1920 image to share (stories size): the summary and each leg's
 * verdict with its two key numbers. No stake, book, account or anything personal. Data, not a recommendation. */
import { ImageResponse } from "next/og";
import { getDb, hasDatabase } from "@/lib/db";
import { getCheck } from "@/lib/check/run";
import { asChance } from "@/lib/check/odds";
import { verdictLabel } from "@/components/check/CheckResult";

export const dynamic = "force-dynamic";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const INK = "#0b0b12", MUTED = "#6b6b73", BG = "#f7f7f8", GREEN = "#0f7a45", RED = "#c4321f";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9]{8,20}$/.test(id) || !hasDatabase()) return new Response("Not found", { status: 404 });
  const c = await getCheck(getDb(), id);
  if (!c) return new Response("Not found", { status: 404 });
  const legs = c.legs.slice(0, 6);
  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", background: "#ffffff", color: INK, padding: "120px 88px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>insidir</div>
        <div style={{ display: "flex", marginTop: 96, fontSize: 34, color: MUTED }}>{c.legs.length > 1 ? `${c.legs.length}-leg parlay, checked` : "Bet, checked"}</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 76, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3 }}>{c.summary}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 72, gap: 24 }}>
          {legs.map((l, i) => {
            const v = verdictLabel(l);
            const tone = l.verdict === "with" ? GREEN : l.verdict === "against" ? RED : INK;
            const line = l.stock ? `${l.stock.insiderBuys} insiders buying · ${l.stock.insiderSells} selling (90 days)`
              : l.market ? [l.proven?.share != null ? `Proven traders ${pct(l.proven.share)}` : null, l.crowd !== null ? `crowd ${pct(l.crowd)}` : null, l.slip !== null ? `slip ${asChance(l.slip)}` : null].filter(Boolean).join(" · ")
              : "Not on Polymarket or Kalshi yet";
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", background: BG, borderRadius: 40, padding: "40px 48px" }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 600 }}>{(l.stock?.ticker ?? l.leg.selection).slice(0, 40)}</div>
                <div style={{ display: "flex", fontSize: 28, color: MUTED, marginTop: 6 }}>{(l.market?.title ?? l.leg.event).slice(0, 60)}</div>
                <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: tone, marginTop: 20 }}>{v}</div>
                <div style={{ display: "flex", fontSize: 28, color: MUTED, marginTop: 6 }}>{line}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 28, color: MUTED }}>Data, not a recommendation. Check yours at insidir.com/check</div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "public, max-age=300" } },
  );
}

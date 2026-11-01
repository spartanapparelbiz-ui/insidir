/* GET /read/<id>/image: a Read to share, 1080×1350: the market, the proven-money split, the price on each venue, how
 * many big bets came in, and insidir.com. No bet details, no analyst line, no wallet, nothing about who read it. */
import { ImageResponse } from "next/og";
import { getDb, hasDatabase } from "@/lib/db";
import { ADVICE } from "@/lib/copy";
import { cents, pct } from "@/lib/read/math";
import { getRead } from "@/lib/read/store";

export const dynamic = "force-dynamic";
/** "From 2 winning trackers and 3 proven wallets". Counts only: no tracker record, wallet or bet details. */
const who = (t: number, w: number) => `From ${[t ? `${t} winning ${t === 1 ? "tracker" : "trackers"}` : null, w ? `${w} proven ${w === 1 ? "wallet" : "wallets"}` : null].filter(Boolean).join(" and ")}`;
const INK = "#0b0b12", MUTED = "#6b6b73", BG = "#f7f7f8", GREEN = "#0f7a45";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = hasDatabase() ? await getRead(getDb(), id).catch(() => null) : null;
  if (!r) return new Response("Not found", { status: 404 });
  const d = r.data, share = d.proven.yesShare;
  const price = (v: "kalshi" | "polymarket") => `${d.yesLabel} ${cents(d.prices.yes[v])} · ${d.noLabel} ${cents(d.prices.no[v])}`;
  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: "flex", flexDirection: "column", background: "#ffffff", color: INK, padding: "96px 88px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, color: MUTED }}>The Read</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 68, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2 }}>{d.question.slice(0, 110)}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 64, background: BG, borderRadius: 40, padding: "44px 52px" }}>
          <div style={{ display: "flex", fontSize: 32, color: MUTED }}>Proven money</div>
          {share !== null ? (
            <>
              <div style={{ display: "flex", marginTop: 24, height: 28, borderRadius: 14, background: "#e4e4e8", overflow: "hidden" }}>
                <div style={{ display: "flex", width: `${Math.round(share * 100)}%`, background: GREEN }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 40, fontWeight: 600 }}>
                <span>{d.yesLabel.slice(0, 24)} {pct(share)}</span><span>{d.noLabel.slice(0, 24)} {pct(1 - share)}</span>
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 30, color: MUTED }}>{who(d.proven.trackers?.length ?? 0, d.proven.wallets)}</div>
            </>
          ) : <div style={{ display: "flex", marginTop: 16, fontSize: 40 }}>No proven money in it yet</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, background: BG, borderRadius: 40, padding: "44px 52px", fontSize: 34 }}>
          <div style={{ display: "flex", fontSize: 32, color: MUTED }}>Price now</div>
          {d.prices.yes.kalshi !== null ? <div style={{ display: "flex", marginTop: 14 }}>Kalshi: {price("kalshi")}</div> : null}
          {d.prices.yes.polymarket !== null ? <div style={{ display: "flex", marginTop: 10 }}>Polymarket: {price("polymarket")}</div> : null}
          <div style={{ display: "flex", marginTop: 14, color: MUTED, fontSize: 30 }}>{d.bets.length} big {d.bets.length === 1 ? "bet" : "bets"} in the last 24 hours</div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: -1 }}>insidir.com</div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED, maxWidth: 520, textAlign: "right" }}>{ADVICE}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "public, max-age=300" } },
  );
}

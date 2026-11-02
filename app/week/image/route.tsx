/* GET /week/image: the member's week to share, 1080×1350, in the new design system's colours: "Proven money was
 * right on X of Y of my markets this week", their settled markets with the result, and insidir.com. Nothing about who
 * they are: no name, email or wallet. Members only. */
import { ImageResponse } from "next/og";
import { getViewer } from "@/lib/auth/viewer";
import { ADVICE } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { weeklyRecap } from "@/lib/read/member";

export const dynamic = "force-dynamic";
const BG = "#0A0C10", PANEL = "#14171C", LINE = "#23272E", MUTED = "#9BA3AE", UP = "#22C58B", DOWN = "#F0565B";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan) || !hasDatabase()) return new Response("Not found", { status: 404 });
  const w = await weeklyRecap(getDb(), viewer.user.id, Date.now());
  if (!w.of) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: "flex", flexDirection: "column", background: BG, color: "#fff", padding: "96px 88px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, color: MUTED, letterSpacing: 2 }}>MY WEEK ON INSIDIR</div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 28, fontSize: 76, fontWeight: 900, lineHeight: 1.08, letterSpacing: -2 }}>
          <span>Proven money was right on&nbsp;</span><span style={{ color: UP }}>{w.right}</span><span>&nbsp;of {w.of} of my markets this week.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 32, padding: "20px 40px" }}>
          {w.lines.slice(0, 6).map(l => (
            <div key={l.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: `1px solid ${LINE}`, fontSize: 30 }}>
              <span style={{ display: "flex", maxWidth: 700 }}>{l.question.slice(0, 48)}</span>
              <span style={{ display: "flex", color: l.right ? UP : DOWN, fontWeight: 700 }}>{l.right ? "Right" : "Wrong"}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>insidir.com</div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED, maxWidth: 520, textAlign: "right" }}>{ADVICE}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "private, no-store" } },
  );
}

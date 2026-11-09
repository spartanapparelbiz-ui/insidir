/* GET /copies/recap.png: the signed-in member's weekly recap as a 1080×1350 image to share: "Your winner vs. the
 * field", this week, at their size. The wallet only by its short address; no name, email or account. Every number is
 * the same one My copies shows (lib/copies). Past results, not a promise. */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { copySizeOf } from "@/lib/copies/size";
import { returnText, signedDollars } from "@/lib/copies/math";
import { copiesOf, copyPnl, fieldWeek } from "@/lib/copies/store";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
const INK = "#f3f7ff", MUTED = "#93aad8", BG = "#0a2463", GREEN = "#19d27a", RED = "#ff4d6a";
const col = (v: number) => (v > 0.5 ? GREEN : v < -0.5 ? RED : INK);

export async function GET(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user || !isPaid(user.plan) || !hasDatabase()) return new Response("Not found", { status: 404 });
  const db = getDb(), now = Date.now(), size = copySizeOf(user.settings);
  const copies = await copiesOf(db, user.id);
  if (!copies.length) return new Response("Not found", { status: 404 });
  const [[main], field] = await Promise.all([copyPnl(db, copies.slice(0, 1), size, now), fieldWeek(db, size, now)]);
  const mine = main!.week;
  const box = (label: string, big: string, small: string, v: number) => (
    <div style={{ display: "flex", flexDirection: "column", background: BG, borderRadius: 40, padding: "48px 56px" }}>
      <div style={{ display: "flex", fontSize: 32, color: MUTED }}>{label}</div>
      <div style={{ display: "flex", fontSize: 104, fontWeight: 600, letterSpacing: -4, color: col(v), marginTop: 12 }}>{big}</div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 8 }}>{small}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: "flex", flexDirection: "column", background: "#071b53", color: INK, padding: "104px 88px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>insidir</div>
        <div style={{ display: "flex", marginTop: 80, fontSize: 76, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3 }}>Your winner vs. the field</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 34, color: MUTED }}>This week, ${size} on every move</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 64 }}>
          {box(`Copying ${main!.copy.label}`, returnText(mine) ?? "—", mine.n ? `${signedDollars(mine.net)} on ${mine.n} settled` : "Nothing settled yet", mine.net)}
          {box("The field", returnText(field) ?? "—", field.n ? `${field.n.toLocaleString("en-US")} settled positions` : "Nothing settled yet", field.net)}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 26, color: MUTED }}>Bought at the price Insidir showed plus one point, held to settlement. Past results, not a promise.</div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "private, no-store" } },
  );
}

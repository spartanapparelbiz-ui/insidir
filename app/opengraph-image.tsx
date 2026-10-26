/* The site's link preview: black, the logo, the serif headline, and a faint photo texture (lib/share-card.tsx). */
import { ImageResponse } from "next/og";
import { loadFonts, OG, OgLogo, texture } from "@/lib/share-card";

export const alt = "Insidir: follow the big money";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [fonts, bg] = await Promise.all([loadFonts(), texture("wide")]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: OG.ink, color: OG.paper, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, fontFamily: "Sans", position: "relative" }}>
        <img src={bg} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0, opacity: 0.22 }} />
        <OgLogo height={64} />
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: 96, lineHeight: 1.02 }}>Follow the big money.</div>
        <div style={{ display: "flex", fontSize: 30, color: OG.grey2, maxWidth: 940 }}>The biggest bets and trades on Kalshi, Polymarket and Wall Street, the second they happen. In plain English.</div>
      </div>
    ),
    { ...size, fonts },
  );
}

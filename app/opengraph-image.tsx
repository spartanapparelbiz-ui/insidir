/* The site's link preview: a thin photo strip on top (lib/share-card.tsx), then black with the logo and the serif headline. */
import { ImageResponse } from "next/og";
import { loadFonts, OG, OgLogo, strip, STRIP_H } from "@/lib/share-card";

export const alt = "Insidir: follow the big money";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [fonts, top] = await Promise.all([loadFonts(), strip("site")]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: OG.ink, color: OG.paper, display: "flex", flexDirection: "column", fontFamily: "Sans" }}>
        <img src={top} width={1200} height={STRIP_H.site} style={{ display: "flex" }} />
        <div style={{ display: "flex", flexGrow: 1, flexDirection: "column", justifyContent: "space-between", padding: "40px 72px 56px" }}>
          <OgLogo height={56} />
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 88, lineHeight: 1.02 }}>Follow the big money.</div>
          <div style={{ display: "flex", fontSize: 28, color: OG.grey2, maxWidth: 940 }}>The biggest bets and trades on Kalshi, Polymarket and Wall Street, the second they happen. In plain English.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

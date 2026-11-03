/* The site's link preview: a thin photo strip on top (lib/share-card.tsx), then black with the logo and the headline. */
import { ImageResponse } from "next/og";
import { loadFonts, OG, OgLogo, strip, STRIP_H } from "@/lib/share-card";
import { WHAT_IS_TITLE } from "@/lib/copy";

export const alt = WHAT_IS_TITLE;
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
          <div style={{ display: "flex", flexDirection: "column", fontWeight: 700, fontSize: 76, lineHeight: 1.02, letterSpacing: -2 }}><span>You're betting</span><span style={{ color: OG.grey3 }}>against millionaires.</span></div>
          <div style={{ display: "flex", fontSize: 28, color: OG.grey2, maxWidth: 940 }}>Check any Polymarket or Kalshi bet against the wallets up $1M+.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

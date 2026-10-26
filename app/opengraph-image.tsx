/* Text-only share card: the wordmark and the headline. No photos, no art. */
import { ImageResponse } from "next/og";
import { AB_TESTS } from "@/lib/analytics";
import { LOGO } from "@/components/Wordmark";

export const alt = "Insidir Terminal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";


export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#000", color: "#f5f5f5", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
        <div style={{ display: "flex" }}>
          <svg width="241" height="80" viewBox={LOGO.viewBox} fill="#f5f5f5">
            <circle cx={LOGO.dot.cx} cy={LOGO.dot.cy} r={LOGO.dot.r} />
            <path d={LOGO.bar} />
            <path d={LOGO.text} />
            {LOGO.textDots.map(d => <circle key={d.cx} cx={d.cx} cy={d.cy} r={d.r} />)}
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{AB_TESTS.hero.a.headline}</div>
        <div style={{ display: "flex", fontSize: 28, color: "#8c9099" }}>Prices that lock in a profit after fees, if both sides fill and both markets settle the same way.</div>
      </div>
    ),
    size,
  );
}

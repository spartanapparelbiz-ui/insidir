/* The link preview for one tracker, market, trader or company (each route's opengraph-image.tsx): white, the logo, what
 * kind of page it is, its name, one line, and one figure with what it means. Real numbers only; none is a promise. */
import { ImageResponse } from "next/og";
import { PAST } from "@/lib/copy";
import { loadFonts, OG, OgLogo } from "@/lib/share-card";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export interface EntityOg {
  kicker: string;
  title: string;
  line?: string | null;
  figure?: { value: string; label: string; tone?: "pos" | "neg" } | null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function entityOg(d: EntityOg): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const tone = d.figure?.tone === "pos" ? OG.money : d.figure?.tone === "neg" ? OG.loss : OG.ink;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: OG.paper, color: OG.ink, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 72px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <OgLogo height={44} color={OG.ink} />
          <div style={{ display: "flex", fontSize: 26, color: OG.grey3 }}>{d.kicker}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: d.title.length > 48 ? 60 : 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>{clip(d.title, 90)}</div>
          {d.line ? <div style={{ display: "flex", fontSize: 30, color: OG.grey3, maxWidth: 1000 }}>{clip(d.line, 120)}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${OG.grey2}`, paddingTop: 28 }}>
          {d.figure ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: tone, letterSpacing: -1 }}>{d.figure.value}</div>
              <div style={{ display: "flex", fontSize: 24, color: OG.grey3 }}>{d.figure.label}</div>
            </div>
          ) : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 22, color: OG.grey3 }}>
            <div style={{ display: "flex" }}>insidir.com</div>
            {d.figure ? <div style={{ display: "flex" }}>{PAST}</div> : null}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

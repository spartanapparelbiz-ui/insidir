/* The share card (docs/BRIEF.md §4.16): an image of one closed receipt, OG-sized (1200×630) or story-sized
 * (1080×1920): the event, both prices, "You keep $X at $500", how long it lasted, and insidir.com. Plain type on
 * Ink, the $1 bar in the middle; no logos of the apps. Rendered with next/og (satori), Plus Jakarta Sans embedded
 * (lib/og-fonts, SIL OFL). Server only. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOGO } from "@/components/Wordmark";

export interface ShareCardData {
  title: string;
  legs: Array<{ venueName: string; side: "yes" | "no"; priceCents: number }>;
  /** What $500 kept after fees (or what the stake was capped at); negative when it lost. */
  keep: number;
  keepAt: number;
  /** How long the deal stayed open, ms. */
  lifeMs: number | null;
  /** How it settled: "same" (both sides as expected), "differently", or null while open. */
  settled: "same" | "differently" | null;
}

export type ShareFormat = "og" | "story";
export const SHARE_SIZE: Record<ShareFormat, { width: number; height: number }> = { og: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } };

const C = { ink: "#000000", surface: "#141414", line: "#262626", paper: "#f5f5f2", steel: "#8c9099", dim: "#5a5f66", violet: "#8b7cff" };
const cents = (c: number) => (Number.isInteger(Math.round(c * 10) / 10) ? Math.round(c) : (Math.round(c * 10) / 10).toFixed(1)) + "¢";
const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
export function lastedText(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)} days`;
}

let fonts: Promise<Array<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }>> | null = null;
function loadFonts() {
  fonts ??= Promise.all(([500, 700, 800] as const).map(async weight => ({
    name: "Plus Jakarta Sans", weight, style: "normal" as const,
    data: await readFile(join(process.cwd(), "lib/og-fonts", `plus-jakarta-sans-${weight}.ttf`)),
  })));
  return fonts;
}

export async function shareCardImage(d: ShareCardData, format: ShareFormat): Promise<ImageResponse> {
  const size = SHARE_SIZE[format];
  const story = format === "story";
  const spent = d.legs.reduce((s, l) => s + l.priceCents, 0);
  const gap = Math.max(0, 100 - spent);
  const pad = story ? 96 : 64;
  const big = story ? 120 : 76;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: C.ink, color: C.paper, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: pad, fontFamily: "Plus Jakarta Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <svg width={story ? 180 : 132} height={story ? 60 : 44} viewBox={LOGO.viewBox} fill={C.paper}>
            <circle cx={LOGO.dot.cx} cy={LOGO.dot.cy} r={LOGO.dot.r} />
            <path d={LOGO.bar} />
            <path d={LOGO.text} />
            {LOGO.textDots.map(t => <circle key={t.cx} cx={t.cx} cy={t.cy} r={t.r} />)}
          </svg>
          <div style={{ display: "flex", fontSize: story ? 30 : 22, color: C.steel }}>Receipt</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: story ? 48 : 24 }}>
          <div style={{ display: "flex", fontSize: story ? 56 : 38, lineHeight: 1.15, fontWeight: 700 }}>{d.title}</div>
          <div style={{ display: "flex", flexDirection: story ? "column" : "row", gap: story ? 24 : 16 }}>
            {d.legs.map((l, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", background: C.surface, padding: story ? 32 : 20, flexGrow: story ? 0 : 1, flexBasis: story ? "auto" : 0, gap: 4 }}>
                <div style={{ display: "flex", fontSize: story ? 30 : 20, color: C.steel }}>{l.venueName} · {l.side === "yes" ? "YES" : "NO"}</div>
                <div style={{ display: "flex", fontSize: big, fontWeight: 700, lineHeight: 1 }}>{cents(l.priceCents)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", height: story ? 40 : 24, width: "100%", gap: 2 }}>
            {d.legs.map((l, i) => <div key={i} style={{ display: "flex", width: `${l.priceCents}%`, background: i % 2 ? C.dim : C.line }} />)}
            {gap > 0 ? <div style={{ display: "flex", width: `${gap}%`, background: C.violet }} /> : null}
          </div>
          <div style={{ display: "flex", fontSize: story ? 64 : 40, fontWeight: 700 }}>
            {d.keep >= 0 ? `You keep ${usd(d.keep)} at $${d.keepAt}` : `Lost ${usd(-d.keep)} at $${d.keepAt}`}
          </div>
          <div style={{ display: "flex", fontSize: story ? 32 : 22, color: C.steel, gap: 24 }}>
            {d.lifeMs ? <span>Lasted {lastedText(d.lifeMs)}</span> : null}
            {d.settled ? <span>{d.settled === "same" ? "Both apps settled the same way" : "The apps settled differently"}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: story ? 30 : 20, color: C.steel }}>
          <span style={{ color: C.paper }}>insidir.com</span>
          <span>After fees. Not financial advice.</span>
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() },
  );
}

/* The move share card (docs/INSIDIR-V2.md §7): a 1080×1920 story image of one move. Black with a faint photo texture,
 * the logo, the move in white (who moved, the amount, on what, what it pays, the record when the viewer may see it,
 * when, and how it settled), and the serif headline. No logos of the apps, no advice. Rendered with next/og (satori);
 * fonts, logo and texture from lib/share-card.tsx. Server only. */
import { ImageResponse } from "next/og";
import { insiderWho } from "@/lib/profiles/name";
import { dollars, onWhat, payoutLine, recordLine, stockNote, who } from "@/lib/moves/copy";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { loadFonts, OG, OgLogo, texture } from "@/lib/share-card";

export const MOVE_CARD = { width: 1080, height: 1920 } as const;


const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** The words on the card, separate from the drawing so they can be tested. */
export function moveCardText(m: Move, record: TraderRecord | null) {
  const d = m.detail;
  if (m.source === "sec" && d) {
    return {
      who: d.kind === "insider" ? `${insiderWho(d.ownerName, d.role, d.company)}, bought` : `${d.fund} added`,
      amount: dollars(m.amount),
      on: d.kind === "insider" ? `of ${d.company} stock` : `of ${d.company} last quarter`,
      pays: stockNote(d),
      record: null,
      when: `${WHEN.format(new Date(m.at))} ET`,
      result: null,
    };
  }
  return {
    who: `${who(m, record)} put`,
    amount: dollars(m.amount),
    on: `on ${onWhat(m)}`,
    pays: payoutLine(m),
    record: recordLine(record),
    when: `${WHEN.format(new Date(m.at))} ET`,
    result: m.result === "won" ? "It won." : m.result === "lost" ? "It lost." : null,
  };
}

export async function moveCardImage(m: Move, record: TraderRecord | null): Promise<ImageResponse> {
  const t = moveCardText(m, record);
  const won = m.result === "won";
  // The inner width is 904px; Schibsted Grotesk 800 digits run about 0.62em wide.
  const amountSize = Math.min(200, Math.floor(904 / (t.amount.length * 0.62)));
  const onSize = t.on.length > 60 ? 52 : t.on.length > 32 ? 60 : 72;
  const [fonts, bg] = await Promise.all([loadFonts(), texture("tall")]);
  const tag = m.tab === "stocks" ? "Stocks" : m.tab === "sports" ? (m.league && m.league !== "other" ? m.league : "Sports") : "Markets";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: OG.ink, color: OG.paper, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 88, fontFamily: "Sans", position: "relative" }}>
        <img src={bg} width={MOVE_CARD.width} height={MOVE_CARD.height} style={{ position: "absolute", left: 0, top: 0, opacity: 0.16 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OgLogo height={72} />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: OG.paper, border: `2px solid ${OG.grey3}`, padding: "12px 26px", borderRadius: 999 }}>{tag}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", fontSize: 50, fontWeight: 700, color: OG.grey2 }}>{t.who}</div>
          <div style={{ display: "flex", fontSize: amountSize, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{t.amount}</div>
          <div style={{ display: "flex", fontSize: onSize, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{t.on}</div>
          {t.pays ? <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: OG.ink, background: OG.paper, padding: "24px 32px", borderRadius: 24 }}>{t.pays}</div> : null}
          <div style={{ display: "flex", height: 2, background: OG.grey3 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 40, fontWeight: 700, color: OG.grey2 }}>
            {t.record ? <div style={{ display: "flex", color: OG.paper }}>{t.record}</div> : null}
            <div style={{ display: "flex" }}>{t.when}</div>
          </div>
          {t.result ? (
            <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 44, fontWeight: 800, color: won ? OG.money : OG.loss, background: OG.paper, padding: "16px 32px", borderRadius: 999 }}>{t.result}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 84, lineHeight: 1.02 }}>Follow the big money.</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 500, color: OG.grey2 }}>
            <span style={{ color: OG.paper, fontWeight: 700 }}>insidir.com</span>
            <span>Public trading data. Not financial advice.</span>
          </div>
        </div>
      </div>
    ),
    { ...MOVE_CARD, fonts },
  );
}

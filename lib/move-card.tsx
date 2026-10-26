/* The move share card (docs/V2.md §7): a 1080×1920 story image of one move, in the site's bright style. Who moved,
 * the amount, on what, what it pays, the record (when the viewer may see it), when, and how it settled. No logos of
 * the apps, no advice. Rendered with next/og (satori) and Plus Jakarta Sans (lib/og-fonts, SIL OFL). Server only. */
import { ImageResponse } from "next/og";
import { dollars, onWhat, payoutLine, recordLine, who } from "@/lib/moves/copy";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { loadFonts } from "@/lib/share-card";

export const MOVE_CARD = { width: 1080, height: 1920 } as const;

const C = { bg: "#FFFFFF", soft: "#F6F7FB", line: "#E6E8EF", text: "#0B0B12", muted: "#5B6070", violet: "#5B4BFF", tint: "#F1EEFF", money: "#087A55", moneyTint: "#E8F8F1", loss: "#C2410C", lossTint: "#FFF1E6" };

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** The words on the card, separate from the drawing so they can be tested. */
export function moveCardText(m: Move, record: TraderRecord | null) {
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
  // The card's inner width is 744px; Plus Jakarta 800 digits run about 0.64em wide.
  const amountSize = Math.min(180, Math.floor(744 / (t.amount.length * 0.64)));
  const onSize = t.on.length > 60 ? 56 : t.on.length > 32 ? 64 : 76;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: C.soft, color: C.text, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 88, fontFamily: "Plus Jakarta Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em" }}>Insidir</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: C.violet, background: C.tint, padding: "14px 28px", borderRadius: 999 }}>
            {m.tab === "sports" ? (m.league && m.league !== "other" ? m.league : "Sports") : "Markets"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", background: C.bg, borderRadius: 56, padding: 80, gap: 44, boxShadow: "0 2px 4px rgba(11,11,18,.06), 0 16px 48px rgba(11,11,18,.08)" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: C.muted }}>{t.who}</div>
          <div style={{ display: "flex", fontSize: amountSize, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{t.amount}</div>
          <div style={{ display: "flex", fontSize: onSize, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{t.on}</div>
          {t.pays ? <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: C.money, background: C.moneyTint, padding: "24px 32px", borderRadius: 24 }}>{t.pays}</div> : null}
          <div style={{ display: "flex", height: 2, background: C.line }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 42, fontWeight: 700, color: C.muted }}>
            {t.record ? <div style={{ display: "flex", color: C.text }}>{t.record}</div> : null}
            <div style={{ display: "flex" }}>{t.when}</div>
          </div>
          {t.result ? (
            <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 44, fontWeight: 800, color: won ? C.money : C.loss, background: won ? C.moneyTint : C.lossTint, padding: "16px 32px", borderRadius: 999 }}>{t.result}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em" }}>Follow the big money.</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 500, color: C.muted }}>
            <span style={{ color: C.violet, fontWeight: 700 }}>insidir.com</span>
            <span>Public trading data. Not financial advice.</span>
          </div>
        </div>
      </div>
    ),
    { ...MOVE_CARD, fonts: await loadFonts() },
  );
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { askSummary, NOT_HAVE } from "@/lib/ask/run";
import { planLine } from "@/lib/brand/plan-line";
import { answeredLine } from "@/app/ask/AskBox";

const table = (rows: string[][]) => ({ tool: "price_moves", title: "How “Iran ceasefire” moved (YES price)", columns: ["When", "Move"], numeric: [] as number[], rows: rows.map(r => r.map(text => ({ text }))), sources: [], at: 0, live: true });

describe("the flow pages on the terminal", () => {
  it("the subscription line comes from the plan: $1 · 3 DAYS → $39/MO · CANCEL ANYTIME", () => {
    expect(planLine()).toBe("$1 · 3 DAYS → $39/MO · CANCEL ANYTIME");
  });

  it("Ask's answer without a model reads the rows out, never empty", () => {
    expect(askSummary([table([["1 day ago", "52% → 49% now"], ["Biggest move", "56% → 45% Sunday 1 a.m.–5 a.m."]])]))
      .toBe("How “Iran ceasefire” moved (YES price). 1 day ago: 52% → 49% now, and 1 more row below.");
    expect(askSummary([table([["1 day ago", "52% → 49% now"]])])).toBe("How “Iran ceasefire” moved (YES price). 1 day ago: 52% → 49% now.");
    expect(askSummary([table([])])).toBe(NOT_HAVE);
  });

  it("the ANSWER panel's source footer names the data and the time", () => {
    expect(answeredLine(Date.UTC(2026, 10, 9, 3, 31))).toBe("SOURCE: INSIDIR DATA · ANSWERED 10:31 PM ET");
  });

  it("/ask takes ?q= and asks it once on load; /go, /pricing and /login carry no photo", () => {
    const page = readFileSync("app/ask/page.tsx", "utf8"), box = readFileSync("app/ask/AskBox.tsx", "utf8");
    expect(page).toMatch(/initial=\{q\}/);
    expect(box).toMatch(/asked\.current = true;\s*void ask\(initial\.trim\(\)\)/);
    for (const f of ["app/go/page.tsx", "components/brand/go/Funnel.tsx", "app/pricing/page.tsx", "app/login/page.tsx", "app/results/page.tsx", "app/brief/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/BrandPicture|kind: "photo"|kind: "globe"|slotPhoto|PHOTOS\./);
    }
  });
});

/* Small terminal pieces: SEC code / item / form badges with the SEC's own labels, keyboard hints, the status bar with
 * the research disclaimer, and the calculator's source line. Server-safe (no hooks). */
import { CALC_LINE, RESEARCH_DISCLAIMER } from "@/lib/copy";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import type { FormType } from "@/lib/filings/types";

const tone = (code: string) => (code === "P" ? " fl-code--p" : code === "S" ? " fl-code--s" : "");

/** A Form 4 transaction code: the letter; the SEC's description on hover. P emerald, S crimson, others grey. */
export function CodeBadge({ code }: { code: string }) {
  return <abbr className={`fl-code${tone(code)}`} title={`Code ${code}: ${codeLabel(code)}`} data-testid="fl-code">{code}</abbr>;
}

/** An 8-K item number (cyan) with its official title on hover. */
export function ItemBadge({ item }: { item: string }) {
  return <abbr className="fl-code fl-code--k" title={`Item ${item}: ${itemLabel(item)}`}>{item}</abbr>;
}

/** The form type as filed. */
export function FormBadge({ form }: { form: FormType }) {
  return <span className={`fl-mono${form.startsWith("8-K") ? " fl-k" : ""}`}>{form}</span>;
}

export function Kbd({ k }: { k: string }) {
  return <kbd className="fl-kbd" aria-hidden="true">{k}</kbd>;
}

/** The status bar's disclaimer: on every terminal view (docs/RESEARCH-DESK.md §2.3). */
export function ResearchFoot() {
  return <p className="fl-status__legal" data-testid="fl-disclaimer">{RESEARCH_DISCLAIMER}</p>;
}

/** Under every calculator: whose numbers these are. */
export function CalcLine() {
  return <p className="fl-faint" data-testid="fl-calc-line">{CALC_LINE}</p>;
}

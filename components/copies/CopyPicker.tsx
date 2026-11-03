/* "Pick a winner to copy": the top copyable wallets and trackers with their real record (lib/copies/store.ts
 * copyable), one choice, a form that works without JavaScript (POST /copies/pick). Rows in the homepage's language:
 * a panel, written lines, the white pill. Used by My copies before a member copies anyone (and by onboarding). */
import { hundredLine, roiText } from "@/lib/follow/math";
import type { Copyable } from "@/lib/copies/store";
import { PAST } from "@/lib/copy";

export function CopyPicker({ list, next = "/copies", onboarding = false, cta = "Copy" }: { list: readonly Copyable[]; next?: string; onboarding?: boolean; cta?: string }) {
  if (!list.length) return <p className="b-empty" data-testid="copy-picker-empty">No wallet or tracker has 30 settled positions yet. When one does, it shows up here.</p>;
  return (
    <form method="post" action="/copies/pick" className="s-form" data-testid="copy-picker">
      <input type="hidden" name="next" value={next} />
      {onboarding ? <input type="hidden" name="onboarding" value="1" /> : null}
      <ol className="s-lockrows s-picks" data-stagger="">
        {list.map((c, i) => (
          <li key={`${c.kind}:${c.target}`}>
            <label className="s-pick" data-testid="pick-row">
              <input type="radio" name="pick" value={`${c.kind}:${c.target}`} defaultChecked={i === 0} required />
              <span className="s-pick__main">
                <span className="s-strong" data-testid="pick-name">{c.label}</span>
                <span className="b-small">{c.kind === "trader" ? "Polymarket wallet" : c.line ?? "Tracker"} · {c.record.won}–{c.record.lost} on {c.record.n} settled</span>
              </span>
              <span className="s-pick__fig"><b className="b-num">{roiText(c.record.net, c.record.staked)}</b><span className="b-small">{hundredLine(c.record)}</span></span>
            </label>
          </li>
        ))}
      </ol>
      <p className="b-small">{PAST} Returns follow each position at the price Insidir showed it, plus one point, held to settlement. Nothing is traded for you.</p>
      <div className="b-ctas">
        <button type="submit" className="b-btn b-btn-lg b-primary" data-testid="copy-pick">{cta}</button>
        {onboarding ? <button type="submit" name="skip" value="1" className="s-link">Skip for now</button> : null}
      </div>
    </form>
  );
}

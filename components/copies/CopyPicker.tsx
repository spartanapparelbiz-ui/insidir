/* "Pick a winner to copy": the top copyable wallets and trackers with their real record (lib/copies/store.ts
 * copyable), one choice, a form that works without JavaScript (POST /copies/pick). Used by onboarding and by My copies
 * before a member copies anyone. Server component. */
import { hundredLine, roiText } from "@/lib/follow/math";
import type { Copyable } from "@/lib/copies/store";
import { PAST } from "@/lib/copy";

export function CopyPicker({ list, next = "/", onboarding = false, cta = "Copy" }: { list: readonly Copyable[]; next?: string; onboarding?: boolean; cta?: string }) {
  if (!list.length) return <p className="copy__empty" data-testid="copy-picker-empty">No wallet or tracker has 30 settled positions yet. When one does, it shows up here.</p>;
  return (
    <form method="post" action="/copies/pick" className="cpick" data-testid="copy-picker">
      <input type="hidden" name="next" value={next} />
      {onboarding ? <input type="hidden" name="onboarding" value="1" /> : null}
      <ol className="cpick__list">
        {list.map((c, i) => (
          <li key={`${c.kind}:${c.target}`}>
            <label className="cpick__row">
              <input type="radio" name="pick" value={`${c.kind}:${c.target}`} defaultChecked={i === 0} required />
              <span className="cpick__rank">{i + 1}</span>
              <span className="cpick__main">
                <span className="cpick__name">{c.label}</span>
                <span className="cpick__line">{c.kind === "trader" ? "Polymarket wallet" : c.line ?? "Tracker"} · {c.record.won}–{c.record.lost} on {c.record.n} settled</span>
              </span>
              <span className="cpick__fig">
                <b className={c.roi >= 0 ? "pos" : "neg"}>{roiText(c.record.net, c.record.staked)}</b>
                <span>{hundredLine(c.record)}</span>
              </span>
            </label>
          </li>
        ))}
      </ol>
      <p className="cpick__fine">{PAST} Returns follow each position at the price Insidir showed it, plus one point, held to settlement. Nothing is traded for you.</p>
      <div className="cpick__ctas">
        <button type="submit" className="btn btn--primary btn--big" data-testid="copy-pick">{cta}</button>
        {onboarding ? <button type="submit" name="skip" value="1" className="onb__skip">Skip for now</button> : null}
      </div>
    </form>
  );
}

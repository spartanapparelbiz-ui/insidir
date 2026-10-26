/* One deal in full, as lib/deal-view.ts allows this viewer: the play, the numbers, both legs with venue links, the
 * calculator (paid, live locks) and both markets' rule texts side by side. Rendered by the deal page and, in the
 * browser, by the Terminal's detail sheet. No hooks and no server imports, so it works in both. */
import { SafetyLight } from "@/components/SafetyLight";
import { DollarBar } from "@/components/ui/DollarBar";
import { Sparkline } from "@/components/ui/Sparkline";
import type { DealHistory, DealOk, DealRules } from "@/lib/deal-view";
import { ruleDiff, type DiffPart } from "@/lib/rule-diff";
import { LOCK_LINE, UNLOCK } from "@/lib/copy";
import { centsText, clock2, days, money2, pct2 } from "@/lib/format";
import { Ago } from "./Ago";
import { Calculator } from "./Calculator";
import { LockBar, paysOut } from "./DealTable";
import { Locked } from "./Locked";

const date = (ms: number | null): string => (ms ? new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "Not stated");

function Num({ k, v, cls }: { k: string; v: string | null; cls?: string }) {
  return (
    <div className="dd-num">
      <dt>{k}</dt>
      <dd className={cls}>{v ?? <LockBar w={72} />}</dd>
    </div>
  );
}

/** One rule text, with the words that differ from the other market's text marked. */
function Marked({ parts }: { parts: DiffPart[] }) {
  return <>{parts.map((p, i) => (p.same ? <span key={i}>{p.text}</span> : <mark key={i} className="rdiff">{p.text}</mark>))}</>;
}

/** The gap over the last 30 minutes: a sparkline of real price ticks with its first and latest values. */
function History({ h }: { h: DealHistory }) {
  const first = h.points[0]!, last = h.points[h.points.length - 1]!;
  const unit = (v: number) => (h.metric === "gap" ? `${v.toFixed(1)}¢` : `${v.toFixed(2)}%`);
  const what = h.metric === "gap" ? "Gap per $1" : "ROI";
  return (
    <div className="dd-hist">
      <p className="dd-hist__k">{what}, last 30 min</p>
      <Sparkline points={h.points} w={160} h={32} label={`${what} over the last 30 minutes: from ${unit(first.v)} to ${unit(last.v)}, ${h.points.length} readings.`} />
      <p className="dd-hist__v mono">{unit(first.v)} → {unit(last.v)}</p>
    </div>
  );
}

function Rules({ r, diff }: { r: DealRules; diff?: DiffPart[] | null }) {
  return (
    <article className="rule">
      <p className="rule__venue">{r.venueName}</p>
      <p className="rule__h">{r.title ?? r.fallback}</p>
      {r.title ? (
        <dl className="rule__meta">
          <div><dt>YES pays on</dt><dd>{r.yesLabel}</dd></div>
          <div><dt>Closes</dt><dd>{date(r.closeTime)}</dd></div>
          {r.resolutionSource ? <div><dt>Source</dt><dd>{r.resolutionSource}</dd></div> : null}
        </dl>
      ) : null}
      <div className="rule__text">{r.rules === null ? "The rule text isn't loaded yet. Open the market on the venue to read it."
        : !r.rules ? "The venue publishes no rule text for this market." : diff ? <Marked parts={diff} /> : r.rules}</div>
    </article>
  );
}

export function DealDetail({ view, now, unlockHref, closed = false, closedAt = null, titleId, heading = "h1" }: {
  view: DealOk; now: number; unlockHref: string;
  /** The deal closed while the sheet was open. */
  closed?: boolean;
  /** When it closed (from the live event). */
  closedAt?: number | null;
  titleId?: string;
  heading?: "h1" | "h2";
}) {
  const { row, paid, fills, rules } = view;
  const gone = view.gone || closed;
  const lock = row.kind !== "second_opinion";
  const H = heading;
  const tag = closed ? "Closed" : view.gone ? "No longer live" : row.locked ? "30 min delay" : row.stale ? "Not live" : null;
  const size = row.cost === null ? null : money2(row.cost + (row.fees ?? 0));
  const diff = rules.length === 2 && rules[0]!.rules && rules[1]!.rules ? ruleDiff(rules[0]!.rules, rules[1]!.rules) : null;
  const pays = paysOut(row.closeTime, now);
  const legs = row.legs.map(l => ({ label: `${l.side.toUpperCase()} on ${l.venueName}`, cents: l.priceCents }));
  const fees = row.fees !== null && row.sets ? (100 * row.fees) / row.sets : 0;
  return (
    <div className="dd">
      <header className="dd-head">
        <p className="dd-tags"><SafetyLight safety={row.safety} />{tag ? <span className="tag">{tag}</span> : null}</p>
        <H id={titleId} className="dd-h" tabIndex={-1}>{row.title}</H>
        <p className="dd-play">{row.play}</p>
        <p className="dd-when">
          <Ago at={row.foundAt} now={now} prefix="Found " />.
          {!row.locked && !gone ? <> <Ago at={row.lastSeenAt} now={now} prefix="Last confirmed " />.</> : null}
          {!row.locked && !gone && row.stale ? " Prices may have moved." : ""}
        </p>
      </header>

      {closed ? <p className="banner banner--warn" role="status">Closed. Lasted {clock2((closedAt ?? now) - row.foundAt)}.{row.locked ? " Members got it 30 min before free users." : " The numbers below are its last prices."}</p> : null}

      {lock && row.legs.length >= 2 ? (
        <div className="dd-viz">
          <DollarBar legs={legs} feesCents={fees} size="lg" />
          <div className="dd-viz__side">
            {view.history ? <History h={view.history} /> : null}
            {pays ? <span className="dt-chip">{pays}</span> : null}
          </div>
        </div>
      ) : null}

      <dl className="dd-nums" aria-label="Numbers">
        {lock ? (
          <>
            <Num k="Profit after fees" v={row.profit === null ? null : money2(row.profit)} cls="profit dd-big" />
            <Num k="ROI" v={pct2(row.roi)} />
            <Num k="Max size" v={size} />
            <Num k="Profit per day" v={row.profitPerDay === null ? null : money2(row.profitPerDay)} />
            <Num k="Fees" v={row.fees === null ? null : money2(row.fees)} />
            <Num k="Resolves in" v={days(row.days)} />
          </>
        ) : (
          <>
            <Num k="Price gap" v={`${row.gapCents ?? 0}¢`} />
            <Num k="Resolves in" v={days(row.days)} />
          </>
        )}
      </dl>
      {lock ? <p className="muted small">{LOCK_LINE}</p>
        : <p className="dd-note">This is not a lock. The two venues price the same outcome {row.gapCents ?? 0}¢ apart, and buying one side doesn&apos;t lock in anything.</p>}
      {row.locked ? <a className="btn btn--primary" href={unlockHref} data-unlock="deal-nums">{UNLOCK}</a> : null}

      <section className="dd-sec" aria-labelledby={titleId ? `${titleId}-legs` : "legs-h"}>
        <h3 id={titleId ? `${titleId}-legs` : "legs-h"} className="dd-sec__h">{row.legs.length > 2 ? `The ${row.legs.length} legs` : row.legs.length === 2 ? "Both legs" : "The market"}</h3>
        <div className="legs">
          {row.legs.map((l, i) => {
            const f = fills[i];
            return (
              <div key={i} className="leg">
                <p className="leg__venue">{l.venueName}</p>
                <p className="leg__side"><span className="leg__dir">{l.side.toUpperCase()}</span> at <span className="num">{centsText(l.priceCents)}</span></p>
                <p className="leg__label">{l.label}</p>
                {f ? (
                  <dl className="leg__kv">
                    <div><dt>Contracts</dt><dd>{f.contracts.toLocaleString("en-US")}</dd></div>
                    <div><dt>Worst price</dt><dd>{centsText(f.worstPriceCents)}</dd></div>
                    <div><dt>Cost</dt><dd>{money2(f.cost)}</dd></div>
                    <div><dt>Fee</dt><dd>{money2(f.fee)}</dd></div>
                  </dl>
                ) : null}
                {l.url ? <a className="btn btn--secondary btn--block leg__open" href={l.url} target="_blank" rel="noopener noreferrer">Open on {l.venueName}</a> : null}
              </div>
            );
          })}
        </div>
      </section>

      {lock ? (
        gone ? <p className="muted small">This deal is no longer live, so the calculator is off.</p>
          : view.calc ? <Calculator legs={view.calc.legs} payoutPerSet={view.calc.payoutPerSet} maxSets={view.calc.maxSets} />
            : !paid ? <Locked title="Calculator" text="Members type an amount and see the contracts per side, cost, fees, payout and profit at today's prices." href={unlockHref} plan="insidir" where="deal-calc" quiet />
              : null
      ) : null}

      <section className="dd-sec" aria-labelledby={titleId ? `${titleId}-rules` : "rules-h"}>
        <h3 id={titleId ? `${titleId}-rules` : "rules-h"} className="dd-sec__h">How each market settles <SafetyLight safety={row.safety} /></h3>
        {diff ? <p className="muted small">Words that differ between the two rule texts are <mark className="rdiff">marked</mark>.</p> : null}
        {row.safetyNotes.length ? <ul className="notes">{row.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          : <p className="muted small">{rules.length > 1 ? "No differences found between the markets' rules. Read both before you buy." : "The rules as the venue publishes them."}</p>}
        <div className={`rules${rules.length === 2 ? " rules--two" : ""}`}>
          {rules.map((r, i) => <Rules key={r.key} r={r} diff={diff ? (i === 0 ? diff.a : diff.b) : null} />)}
        </div>
      </section>
    </div>
  );
}

/* My copies, the members' home (/): first, what copying has made at your size since you started, one line per copy
 * ("Copying 0x4f…c2 · +$212 this week"), down when it's down; then every new move from the wallets and trackers you
 * copy (the price they got, the price you can still get, a one-line note, Open); then the weekly recap, "Your winner
 * vs. the field", with its share image. Every number is a row from terminal.moves (lib/copies). No copies yet: pick a
 * winner. Server component. */
import Link from "next/link";
import type { Viewer } from "@/lib/auth/viewer";
import { PAST } from "@/lib/copy";
import { copySizeOf } from "@/lib/copies/size";
import { cents, oneLine, returnText, signedDollars, type CopyResult } from "@/lib/copies/math";
import { copiesOf, copyable, copyMoves, copyPnl, fieldWeek, type CopyMove, type CopyPnl } from "@/lib/copies/store";
import type { Db } from "@/lib/db";
import { agoText, dollars } from "@/lib/moves/copy";
import { CopyPicker } from "./CopyPicker";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const tone = (v: number) => (v > 0.5 ? "pos" : v < -0.5 ? "neg" : "");

function PnlLine({ p, size }: { p: CopyPnl; size: number }) {
  return (
    <li className="mycp__row" data-testid="copy-pnl">
      <p className="mycp__line">
        Copying <b>{p.copy.label}</b> · <b className={tone(p.week.net)} data-testid="copy-week">{signedDollars(p.week.net)}</b> this week
      </p>
      <p className="mycp__sub">
        <span className={tone(p.total.net)} data-testid="copy-total">{signedDollars(p.total.net)}</span> since {DAY.format(p.copy.since)} at ${size} a move
        {" · "}{p.total.won}–{p.total.lost} settled{p.open ? ` · ${p.open} open` : ""}
      </p>
    </li>
  );
}

function MoveRow({ m, now, us }: { m: CopyMove; now: number; us: boolean }) {
  const note = oneLine(m.note);
  return (
    <li className="cmove" data-testid="copy-move" data-open={m.open?.venue ?? "none"}>
      <div className="cmove__head">
        <p className="cmove__h">{m.headline}</p>
        <p className="cmove__s">{m.subline} · {m.from.label} · {dollars(m.amount)} · {agoText(m.at, now)}</p>
      </div>
      <dl className="cmove__prices">
        <div><dt>They got</dt><dd data-testid="their-price">{cents(m.theirPrice)}</dd></div>
        <div><dt>{m.open ? `You can get${m.open.venue === "kalshi" ? " on Kalshi" : ""}` : "You can get"}</dt><dd data-testid="your-price">{m.result ? "Settled" : cents(m.yourPrice)}</dd></div>
      </dl>
      {note ? <p className="cmove__note" data-testid="copy-note">{note}</p> : null}
      <div className="cmove__act">
        {m.result ? <span className="cmove__done">{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Void"}</span>
          : m.open ? <a className="btn btn--secondary" href={m.open.href} target="_blank" rel="noopener noreferrer" data-testid="copy-open">Open on {m.open.venue === "kalshi" ? "Kalshi" : "Polymarket"}</a>
          : <span className="cmove__view" data-testid="copy-view-only">{us ? "View only: not on Kalshi" : "View only"}</span>}
      </div>
    </li>
  );
}

export function Recap({ mine, field, label }: { mine: CopyResult; field: CopyResult; label: string }) {
  const a = returnText(mine), b = returnText(field);
  return (
    <section className="recap" aria-labelledby="recap-h" data-testid="recap">
      <h2 id="recap-h" className="recap__h">Your winner vs. the field</h2>
      <p className="recap__sub">This week, at your size: what copying {label} made, next to every position Insidir showed that settled this week, followed the same way.</p>
      <dl className="recap__grid">
        <div><dt>{label}</dt><dd className={tone(mine.net)}>{a ?? "Nothing settled"}</dd><span>{mine.n ? `${signedDollars(mine.net)} on ${mine.n} settled` : "No settled moves yet"}</span></div>
        <div><dt>The field</dt><dd className={tone(field.net)}>{b ?? "Nothing settled"}</dd><span>{field.n ? `${field.n.toLocaleString("en-US")} settled positions` : "No settled positions yet"}</span></div>
      </dl>
      <p className="recap__share"><a href="/copies/recap.png" download="insidir-week.png" data-testid="recap-share">Download the share image</a> · {PAST}</p>
    </section>
  );
}

export async function MyCopies({ db, viewer, now }: { db: Db | null; viewer: Viewer; now: number }) {
  const user = viewer.user;
  const size = copySizeOf(user?.settings);
  const copies = db && user ? await copiesOf(db, user.id).catch(() => []) : [];
  if (!db || !copies.length) {
    const list = db ? (await copyable(db, now).catch(() => [])).slice(0, 5) : [];
    return (
      <main className="pg mycp" data-testid="my-copies">
        <h1 className="mycp__h">Pick a winner to copy</h1>
        <p className="mycp__lead">Every bet they make from then on shows up here, with the price they got and the price you can still get.</p>
        <CopyPicker list={list} />
      </main>
    );
  }
  const us = viewer.region !== "non_us";
  const [pnl, moves, field] = await Promise.all([
    copyPnl(db, copies, size, now).catch(() => []),
    copyMoves(db, copies, viewer.region, now).catch(() => []),
    fieldWeek(db, size, now).catch(() => null),
  ]);
  const main = pnl[0];
  return (
    <main className="pg mycp" data-testid="my-copies">
      <h1 className="mycp__h">My copies</h1>
      <ul className="mycp__pnl">{pnl.map(p => <PnlLine key={`${p.copy.kind}:${p.copy.target}`} p={p} size={size} />)}</ul>
      <p className="mycp__fine">Counts only moves shown after each copy began, bought at the price Insidir showed plus one point, held to settlement. <Link href="/settings#copy-size">Change your size (${size} a move)</Link> · <Link href="/top">Copy another winner</Link></p>
      <section className="mycp__feed" aria-labelledby="moves-h">
        <h2 id="moves-h" className="mycp__h2">New moves</h2>
        {moves.length ? <ol className="cmoves">{moves.map(m => <MoveRow key={m.id} m={m} now={now} us={us} />)}</ol>
          : <p className="copy__empty" data-testid="copy-moves-empty">No new moves since you started copying. They show up here the moment Insidir sees them.</p>}
        {us ? <p className="mycp__fine">In the US, Open goes to the same market on Kalshi when there is one; otherwise the move is view only.</p> : null}
      </section>
      {main && field ? <Recap mine={main.week} field={field} label={main.copy.label} /> : null}
    </main>
  );
}

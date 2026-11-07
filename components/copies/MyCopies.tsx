/* My copies (/copies), in the homepage's stages: copying whole wallets and trackers.
 *   1 Result     "My copies are up $212 since Nov 1.": one line per copy ("Copying 0x4f…c2 · +$212 this week"), down
 *                when it's down, at the member's size
 *   2 New moves  every new move from what they copy: the price they got, the price you can still get, a one-line
 *                note, Open (Kalshi only in the US)
 *   3 The week   "Your winner vs. the field", with its share image
 * No copies yet: "Pick a winner to copy". Every number is a row from terminal.moves (lib/copies). Server component. */
import type { Viewer } from "@/lib/auth/viewer";
import { Insight, Lines, Panel, Pill, Stage } from "@/components/system";
import { PHOTOS } from "@/lib/brand/images";
import { PAST } from "@/lib/copy";
import { copySizeOf } from "@/lib/copies/size";
import { cents, oneLine, returnText, signedDollars, type CopyResult } from "@/lib/copies/math";
import { copiesOf, copyable, copyMoves, copyPnl, fieldWeek, type CopyMove, type CopyPnl } from "@/lib/copies/store";
import type { Db } from "@/lib/db";
import { agoText, dollars } from "@/lib/moves/copy";
import { CopyPicker } from "./CopyPicker";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

function PnlLine({ p, size }: { p: CopyPnl; size: number }) {
  return (
    <li data-testid="copy-pnl">
      <span>
        <span className="s-strong" data-testid="copy-line">Copying {p.copy.label} · <span data-testid="copy-week">{signedDollars(p.week.net)}</span> this week</span><br />
        <span className="b-small"><span data-testid="copy-total">{signedDollars(p.total.net)}</span> since {DAY.format(p.copy.since)} at ${size} a move{" · "}{p.total.won}–{p.total.lost} settled{p.open ? ` · ${p.open} open` : ""}</span>
      </span>
    </li>
  );
}

function MoveRow({ m, now, us }: { m: CopyMove; now: number; us: boolean }) {
  const note = oneLine(m.note);
  return (
    <li className="s-move" data-testid="copy-move" data-open={m.open?.venue ?? "none"}>
      <span className="s-move__main">
        <span className="s-strong">{m.headline}</span>
        <span className="b-small">{m.subline} · {m.from.label} · {dollars(m.amount)} · {agoText(m.at, now)}</span>
        {note ? <span className="b-small" data-testid="copy-note">{note}</span> : null}
      </span>
      <dl className="s-kv s-move__px">
        <div><dt className="b-small">They got</dt><dd className="s-strong b-num" data-testid="their-price">{cents(m.theirPrice)}</dd></div>
        <div><dt className="b-small">{m.open ? `You can get${m.open.venue === "kalshi" ? " on Kalshi" : ""}` : "You can get"}</dt><dd className="s-strong b-num" data-testid="your-price">{m.result ? "Settled" : cents(m.yourPrice)}</dd></div>
      </dl>
      <span className="s-move__act">
        {m.result ? <span className="b-small">{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Void"}</span>
          : m.open ? <a className="b-btn b-btn-lg b-ghost" href={m.open.href} target="_blank" rel="noopener noreferrer" data-testid="copy-open">Open on {m.open.venue === "kalshi" ? "Kalshi" : "Polymarket"}</a>
          : <span className="b-small" data-testid="copy-view-only">{us ? "View only: not on Kalshi" : "View only"}</span>}
      </span>
    </li>
  );
}

function Recap({ mine, field, label }: { mine: CopyResult; field: CopyResult; label: string }) {
  const a = returnText(mine), b = returnText(field);
  return (
    <Stage bg={{ kind: "photo", photo: PHOTOS.golf, dark: 0.6 }} testid="recap" labelledBy="recap-h">
      <div className="b-head"><Lines as="h2" id="recap-h" lines={["Your winner", "vs. the field"]} size={52} />
        <p className="b-sub">This week, at your size: what copying {label} made, next to every position Insidir showed that settled this week, followed the same way.</p></div>
      <div className="s-split">
        <Panel><p className="b-label">{label}</p><p className="s-big b-num">{a ?? "Nothing settled"}</p><p className="b-small">{mine.n ? `${signedDollars(mine.net)} on ${mine.n} settled` : "No settled moves yet"}</p></Panel>
        <Panel><p className="b-label">The field</p><p className="s-big b-num">{b ?? "Nothing settled"}</p><p className="b-small">{field.n ? `${field.n.toLocaleString("en-US")} settled positions` : "No settled positions yet"}</p></Panel>
      </div>
      <p className="b-small b-center"><a className="s-link" href="/copies/recap.png" download="insidir-week.png" data-testid="recap-share">Download the share image</a> · {PAST}</p>
    </Stage>
  );
}

export async function MyCopies({ db, viewer, now }: { db: Db | null; viewer: Viewer; now: number }) {
  const user = viewer.user;
  const size = copySizeOf(user?.settings);
  const copies = db && user ? await copiesOf(db, user.id).catch(() => []) : [];
  if (!db || !copies.length) {
    const list = db ? (await copyable(db, now).catch(() => [])).slice(0, 5) : [];
    return (
      <div data-testid="my-copies">
        <Stage bg={{ kind: "photo", photo: PHOTOS.cta, dark: 0.55, priority: true }} first testid="copies-pick" labelledBy="pick-h">
          <div className="b-head"><Lines as="h1" id="pick-h" lines={["Pick a winner to copy"]} size={56} />
            <p className="b-sub" data-m="lift">Every bet they make from then on shows up here, with the price they got and the price you can still get.</p></div>
          <Panel className="s-col s-col--wide"><CopyPicker list={list} /></Panel>
        </Stage>
      </div>
    );
  }
  const us = viewer.region !== "non_us";
  const [pnl, moves, field] = await Promise.all([
    copyPnl(db, copies, size, now).catch(() => []),
    copyMoves(db, copies, viewer.region, now).catch(() => []),
    fieldWeek(db, size, now).catch(() => null),
  ]);
  const main = pnl[0];
  const net = pnl.reduce((t, p) => t + p.total.net, 0);
  const since = pnl.length ? Math.min(...pnl.map(p => p.copy.since)) : null;
  const lead = pnl.length && Math.round(net) !== 0 && since ? `My copies are ${net > 0 ? "up" : "down"} ${dollars(Math.abs(net))} since ${DAY.format(since)}.` : null;
  return (
    <div data-testid="my-copies">
      <Stage bg={{ kind: "photo", photo: PHOTOS.cta, dark: 0.55, priority: true }} first testid="copies-result" labelledBy="mycp-h">
        <div className="b-head"><Insight id="mycp-h" text={lead} fallback={["My copies."]} size={56} />
          <p className="b-sub" data-m="lift">At ${size} a move, counting only moves shown after each copy began, bought at the price Insidir showed plus one point, held to settlement.</p></div>
        <Panel className="s-col s-col--wide"><ul className="s-lockrows">{pnl.map(p => <PnlLine key={`${p.copy.kind}:${p.copy.target}`} p={p} size={size} />)}</ul>
          <div className="b-ctas"><Pill href="/settings#copy-size" kind="ghost">Change your size</Pill><Pill href="/wallets" kind="ghost">Copy another wallet</Pill></div></Panel>
      </Stage>
      <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.6 }} testid="copies-moves" labelledBy="moves-h">
        <div className="b-head"><Insight id="moves-h" as="h2" text={moves.length ? `${moves.length} new ${moves.length === 1 ? "move" : "moves"} from what you copy.` : null} fallback={["New moves."]} size={52} />
          {us ? <p className="b-sub">In the US, Open goes to the same market on Kalshi when there is one; otherwise the move is view only.</p> : null}</div>
        {moves.length ? <Panel className="s-col s-col--wide"><ol className="s-lockrows" data-stagger="">{moves.map(m => <MoveRow key={m.id} m={m} now={now} us={us} />)}</ol></Panel>
          : <p className="b-empty b-center" data-testid="copy-moves-empty">No new moves since you started copying. They show up here the moment Insidir sees them.</p>}
        <p className="b-small b-center">Information, not advice. Insidir never places a bet or holds money.</p>
      </Stage>
      {main && field ? <Recap mine={main.week} field={field} label={main.copy.label} /> : null}
    </div>
  );
}

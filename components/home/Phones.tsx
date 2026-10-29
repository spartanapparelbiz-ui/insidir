/* The home hero's five phones, fanned across: real app screens drawn small from real rows (no screenshots, no made-up
 * numbers). Left to right: the feed, Results, a tracker (the centre phone), the trackers list and the alert a follower
 * gets. A screen whose data isn't there yet is left out rather than filled in. The phones are pictures of the
 * product: inert and hidden from assistive tech. */
import type { ReactNode } from "react";
import { Wordmark, LOGO } from "@/components/Wordmark";
import { RecordResult } from "@/components/trackers/Tracker";
import { TrackerCover, type CoverStats } from "@/components/trackers/TrackerCover";
import { Result } from "@/components/ui/Result";
import { dollars, signedShort } from "@/lib/moves/copy";
import type { FeedItem } from "@/lib/moves/feed";
import type { Tracker, TrackerRecord } from "@/lib/trackers";

export interface PhoneData {
  feed: FeedItem[];
  results: FeedItem[];
  tracker: { t: Tracker; record: TrackerRecord | null; cover: CoverStats | null; moves: FeedItem[] } | null;
  list: Array<{ t: Tracker; record: TrackerRecord | null; cover: CoverStats | null }>;
  alert: { tracker: string; body: string; time: string } | null;
}

function Phone({ children, pos }: { children: ReactNode; pos: number }) {
  return (
    <div className={`phone phone--${pos} rise`} style={{ ["--i" as string]: 4 + Math.abs(pos - 2) }}>
      <div className="phone__screen">
        <div className="phone__bar"><span className="phone__logo"><Wordmark /></span></div>
        <div className="phone__body">{children}</div>
      </div>
    </div>
  );
}

const SOURCE: Record<FeedItem["source"], string> = { polymarket: "Polymarket", kalshi: "Kalshi", sec: "SEC" };

/** A preview row: the outcome, the market, where it traded and when; never who (no wallet names on home). */
const Row = ({ m }: { m: FeedItem }) => (
  <div className="pm">
    <p className="pm__amt">{dollars(m.amount)}</p>
    <p className="pm__line">{m.headline}</p>
    <p className="pm__ago">{m.subline} · {SOURCE[m.source]} · {m.ago}</p>
  </div>
);

export function Phones({ d }: { d: PhoneData }) {
  const screens: ReactNode[] = [];
  if (d.feed.length) screens.push(
    <><p className="ph__h">Feed</p><div className="ph__list">{d.feed.slice(0, 4).map(m => <Row key={m.id} m={m} />)}</div></>,
  );
  if (d.results.length) screens.push(
    <><p className="ph__h">Results</p><div className="ph__list">{d.results.slice(0, 4).map(m => (
      <div key={m.id} className="pm pm--res">
        <p className="pm__line">{m.headline}<span className="pm__ago">{SOURCE[m.source]} · {m.subline}</span></p>
        <Result amount={m.pnl !== null && m.pnl !== undefined ? signedShort(m.pnl) : dollars(m.amount)} tone={m.result === "won" ? "won" : "lost"} status={m.result === "won" ? "Won" : "Lost"} />
      </div>
    ))}</div></>,
  );
  if (d.tracker) {
    screens.splice(Math.min(2, screens.length), 0,
      <>
        <TrackerCover t={d.tracker.t} s={d.tracker.cover} className="ph__cover" />
        <p className="ph__h ph__h--t">{d.tracker.t.name}</p>
        <p className="ph__by">by Insidir</p>
        <div className="ph__row"><span className="ph__follow">Follow</span><RecordResult r={d.tracker.record} /></div>
        <div className="ph__list">{d.tracker.moves.slice(0, 3).map(m => <Row key={m.id} m={m} />)}</div>
      </>,
    );
  }
  if (d.list.length) screens.push(
    <><p className="ph__h">Trackers</p><div className="ph__list ph__list--rows">{d.list.slice(0, 6).map(({ t, record, cover }) => (
      <div key={t.slug} className="ph__trow">
        <TrackerCover t={t} s={cover} small className="ph__thumb" />
        <span className="ph__tname">{t.name}<span>by Insidir</span></span>
        <RecordResult r={record} />
      </div>
    ))}</div></>,
  );
  if (d.alert) screens.push(
    <div className="ph__lock">
      <p className="ph__clock">{d.alert.time}</p>
      <div className="ph__note">
        <span className="ph__icon"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
        <div><p className="ph__nh"><b>New move in {d.alert.tracker}</b><span>now</span></p><p className="ph__nt">{d.alert.body}</p></div>
      </div>
    </div>,
  );
  if (!screens.length) return null;
  const shown = screens.slice(0, 5);
  const offset = Math.floor((5 - shown.length) / 2);
  return (
    <div className="fan" aria-hidden="true" inert>
      {shown.map((s, i) => <Phone key={i} pos={i + offset}>{s}</Phone>)}
    </div>
  );
}

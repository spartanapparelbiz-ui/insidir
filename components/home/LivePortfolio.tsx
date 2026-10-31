/* Home: "A live portfolio of big money". One tracker (the best by ROI with a record, else Whales) as a card: its
 * cover, ROI and record, what it holds now (its largest open positions: size, outcome, entry, market and when) and its
 * latest settled results with their real P&L. Every row is from terminal.moves on the viewer's clock. */
import Link from "next/link";
import { MoveArt } from "@/components/MoveArt";
import { TrackerCover, type CoverStats } from "@/components/trackers/TrackerCover";
import { Result } from "@/components/ui/Result";
import { signedShort } from "@/lib/moves/copy";
import type { FeedItem } from "@/lib/moves/feed";
import { short } from "@/lib/moves/headline";
import { recordResult, returnPct, returnTone, trackerHref, type Tracker, type TrackerRecord } from "@/lib/trackers";

export interface PortfolioData { t: Tracker; record: TrackerRecord | null; cover: CoverStats | null; open: FeedItem[]; results: FeedItem[]; openCount: number; openAmount: number }

const SOURCE: Record<FeedItem["source"], string> = { polymarket: "Polymarket", kalshi: "Kalshi", sec: "SEC" };

export function LivePortfolio({ d }: { d: PortfolioData }) {
  const roi = returnPct(d.record), rec = recordResult(d.record);
  return (
    <section className="sec3 lport" aria-labelledby="lport-h">
      <div className="pg">
        <h2 id="lport-h" className="sec3__h">A live portfolio of big money</h2>
        <p className="lport__sub">Each tracker holds every large position that fits its rule, opened and settled in public. This is one of them, now.</p>
        <article className="lport__card">
          <Link className="lport__head" href={trackerHref(d.t.slug)}>
            <TrackerCover t={d.t} s={d.cover} ratio="21:9" sizes="(min-width: 1200px) 1168px, 100vw" className="lport__cover" />
            <span className="lport__name">{d.t.name}</span>
            <span className="lport__line">{d.t.line}</span>
            <span className="lport__nums">
              <span className="lport__fig"><b className={`lport__v lport__v--${roi ? returnTone(d.record) : "nil"}`} data-count="">{roi ?? "—"}</b><span>ROI</span></span>
              <span className="lport__fig"><b className={`lport__v lport__v--${rec.amount ? rec.tone : "nil"}`} data-count="">{rec.amount ?? "—"}</b><span>{rec.amount ? `Net P&L · ${rec.status}` : "Net P&L · under 20 settled"}</span></span>
            </span>
          </Link>
          <div className="lport__body">
            <div className="lport__col">
              <h3 className="lport__h">Holding now<span>{d.openCount.toLocaleString("en-US")} open · {short(d.openAmount)}</span></h3>
              {d.open.length ? <ol className="lport__list">{d.open.map(m => (
                <li key={m.id} className="lport__row">
                  <MoveArt art={m.art} />
                  <span className="lport__what"><span className="lport__out">{m.headline}</span><span className="lport__meta">{m.subline} · {SOURCE[m.source]} · {m.ago}</span></span>
                  <Result amount={short(m.amount)} status={m.inAt ? `Entry ${m.inAt}` : "Open"} />
                </li>
              ))}</ol> : <p className="lport__none">No open positions right now.</p>}
            </div>
            <div className="lport__col">
              <h3 className="lport__h">Latest results</h3>
              {d.results.length ? <ol className="lport__list">{d.results.map(m => (
                <li key={m.id} className="lport__row">
                  <MoveArt art={m.art} />
                  <span className="lport__what"><span className="lport__out">{m.headline}</span><span className="lport__meta">{m.subline} · {SOURCE[m.source]}</span></span>
                  <Result amount={m.pnl !== null ? signedShort(m.pnl) : null} tone={m.result === "won" ? "won" : m.result === "lost" ? "lost" : "none"} status={m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Voided"} />
                </li>
              ))}</ol> : <p className="lport__none">No settled positions yet.</p>}
            </div>
          </div>
          <p className="lport__foot"><Link className="tlink tlink--go" href={trackerHref(d.t.slug)}>Open {d.t.name} <span className="arrow" aria-hidden="true">→</span></Link></p>
        </article>
      </div>
    </section>
  );
}

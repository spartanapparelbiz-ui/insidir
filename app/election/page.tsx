/* /election: the next section of the homepage, at full depth. A dusk stage whose headline is computed from the data
 * ("Millionaires are 74% on Ken Paxton in Texas Senate. The price says 26¢."), then every major race with its
 * candidates: a verified face (Polymarket's own image for that market, shown only when its file names the candidate and
 * the race; otherwise initials), the live price, and the millionaire money on and against each; results as markets
 * settle. Visitors get 3 races whole and the rest locked behind Start for $1; members see every race. Refreshes every
 * minute. Never blocks: without data it says so. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { PayMoments } from "@/components/brand/PayMoments";
import { Insight, Lines, Panel, Pill, Refresh, Stage } from "@/components/system";
import { RaceCards } from "@/components/system/Races";
import { getViewer } from "@/lib/auth/viewer";
import { PHOTOS } from "@/lib/brand/images";
import { electionDay as isElectionDay } from "@/lib/brand/pulse";
import { getDb, hasDatabase } from "@/lib/db";
import { electionDay, raceInsight, type ElectionDay } from "@/lib/market/races";
import { dollars } from "@/lib/money";
import { isPaid, TRIAL } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Election Day: every race, live", description: "Control of the Senate and House and the top Senate and governor races: the candidates, the live price, and where the money of Polymarket wallets up $1M+ sits." };

export default async function ElectionPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan), now = Date.now();
  const empty: ElectionDay = { races: [], locked: [], at: now };
  const d = hasDatabase() ? await electionDay(getDb(), now, member).catch(e => { console.error("election", e instanceof Error ? e.message : e); return empty; }) : empty;
  const insight = raceInsight(d);
  const today = isElectionDay(now);
  return (
    <Frame member={member} current="election" testid="election-page">
      <Refresh everyMs={60_000} />
      <Stage bg={{ kind: "photo", photo: PHOTOS.politics, dark: 0.45, priority: true }} first testid="election-band" labelledBy="election-h">
        <div className="b-head">
          <Insight id="election-h" text={insight} fallback={["Tonight.", "Every race."]} size={60} />
          <p className="b-sub" data-m="lift">{today ? "Every major race tonight: the candidates, the live price, and where the money of wallets up $1M+ sits. Live, every minute." : "The major races: the candidates, the price, and where the money of wallets up $1M+ sits."}</p>
        </div>
        {member ? null : <div className="b-center"><div className="b-ctas"><Pill href="/go" data-testid="election-start" data-checkout="election">Start for ${TRIAL.fee}</Pill></div></div>}
      </Stage>
      <Stage testid="election-races-stage" labelledBy="races-h">
        <div className="b-head"><Lines id="races-h" lines={["Tonight.", "Every race."]} size={56} /></div>
        {d.races.length ? <RaceCards races={d.races} testid="election-races" /> : <p className="b-empty" data-testid="election-empty">No race has money from watched wallets this week yet. It fills in as the money moves.</p>}
        {!member && d.locked.length ? (
          <Panel className="s-locked" testid="election-locked">
            <p className="b-label">{d.locked.length} more {d.locked.length === 1 ? "race" : "races"} for members</p>
            <ul className="s-lockrows">{d.locked.map(l => <li key={l.title}><span>{l.title.replace(/ Election Winner$/, "")}</span><span className="b-small b-num">{dollars(l.total)} from watched wallets</span></li>)}</ul>
            <div className="b-ctas"><Pill href="/go" data-checkout="election-locked">Start for ${TRIAL.fee}</Pill></div>
          </Panel>
        ) : null}
        <p className="b-small b-center">Live prices from Polymarket. Faces come from each market&apos;s own image and show only when the name and the race match. Information, not advice.</p>
      </Stage>
      {member ? null : <PayMoments ctx={{ count: 0, window: "day", biggest: null }} now={now} />}
    </Frame>
  );
}

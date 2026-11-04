/* Race cards (the Election stage, on the homepage and /election): the race, then each candidate as the subject: a
 * verified face (or initials; control of a chamber shows a party disc), the name, the live price as a meter that grows
 * on entry, where the millionaire money sits on and against them, and the result once the market settles. Green and
 * red never appear here: they belong to price changes. */
import { candidateMoney, type RaceCard } from "@/lib/market/races";
import { dollars } from "@/lib/money";
import { racePath, raceSlugOf } from "@/lib/entities/slug";
import { Face, Panel, Party } from "./index";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);

export function RaceCards({ races, testid = "races" }: { races: RaceCard[]; testid?: string }) {
  return (
    <div className="s-races" data-testid={testid} data-stagger="">
      {races.map(r => (
        <Panel key={r.key} className="s-race" testid="race-card" data-race={r.key}>
          <h3 className="s-race__t"><a className="s-link" href={racePath(raceSlugOf(r.key, r.title))} data-entity="race">{r.title.replace(/ Election Winner$/, "")}</a></h3>
          {r.candidates.length ? (
            <ul className="s-cands">{r.candidates.map(c => (
              <li key={c.marketId} data-testid="candidate" data-market={c.marketId} data-face={c.image ? "photo" : "initials"} data-result={c.result ?? undefined}>
                {r.kind === "race" ? <Face name={c.name} image={c.image} /> : <Party party={c.party} />}
                <span className="s-cand__n">
                  <span><b>{c.name}</b>{c.party && r.kind === "race" ? <span className="b-dim"> ({c.party})</span> : null}{c.result ? <span className="s-result">{c.result === "won" ? "Won" : "Lost"}</span> : null}</span>
                  <span className="b-bar s-meter" role="img" aria-label={`Price ${cents(c.price)}`}><span data-bar={(c.price ?? 0).toFixed(3)} style={{ transform: `scaleX(${c.price ?? 0})` }} /></span>
                  <span className="b-small" data-testid="candidate-money">{candidateMoney(c)}</span>
                </span>
                <span className="s-cand__p b-num">{cents(c.price)}</span>
              </li>
            ))}</ul>
          ) : r.fallback ? <p className="b-small">{r.fallback.yesLabel} {cents(r.fallback.priceNow)} · {dollars(r.total)} from watched wallets</p> : null}
        </Panel>
      ))}
    </div>
  );
}

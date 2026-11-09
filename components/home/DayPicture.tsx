/* The member home's plain-English layer (inside the AI analyst):
 *   Explained simply   the day in four or five short sentences anyone can follow, built from the real numbers
 *                      (lib/home/data.ts): how much the $1M+ wallets bet, where it went, the biggest bet and what its
 *                      size means, where they disagree with the price and what that means, and a reminder that this is
 *                      information, not advice
 *   The day in a picture   money by hour (bars) and money by category (horizontal bars with share), last 24 hours
 * Pure server markup; no numbers that aren't in the data. */
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import type { Home } from "@/lib/home/data";
import { dollars } from "@/lib/money";

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const catName = (c: string) => (isCategory(c) ? categoryInfo(c).name : c);

/** The day, said simply. Exported for tests. */
export function plainDay(d: Home): string[] {
  const out: string[] = [];
  const money = d.today?.money ?? d.day?.money ?? 0, bets = d.today?.bets ?? d.day?.bets ?? 0;
  const span = d.today ? "Today" : "In the last 24 hours";
  if (money > 0) out.push(`${span}, wallets that have already made over $1 million betting put ${dollars(money)} on ${bets.toLocaleString("en-US")} bets${d.ai.markets ? ` across ${d.ai.markets} markets` : ""}.`);
  const cats = d.ai.cats;
  const total = cats.reduce((s, b) => s + b.total, 0);
  if (cats.length > 1 && total > 0) out.push(`Most of it went to ${catName(cats[0]!.category)}: ${dollars(cats[0]!.total)}, about ${pct(cats[0]!.total / total)} of the money.`);
  const big = [...d.board].sort((a, b) => b.amount - a.amount)[0];
  if (big) {
    const x = big.usual && big.usual > 0 ? big.amount / big.usual : null;
    out.push(`The biggest single bet was ${dollars(big.amount)}${big.outcome ? ` on ${big.outcome}` : ""} in “${big.title}”.` +
      (x && x >= 2 ? ` That's ${x.toFixed(1)}× what this wallet usually bets, which usually means it's more sure than normal.` : x ? " That's about this wallet's normal size." : ""));
  }
  const g = d.disagree[0];
  if (g) out.push(`On “${g.title}”, ${pct(g.share)} of their money is on ${g.outcome}, but the price is only ${cents(g.price)}. The price says ${g.outcome} probably loses; the big wallets are betting it wins.`);
  if (out.length) out.push("This tells you what the big money is doing. It's information, not advice: they lose too.");
  return out;
}

export function DayPicture({ d }: { d: Home }) {
  const lines = plainDay(d);
  const bands = d.ai.cats;
  const byHour = d.ai.hours, hours = byHour.length;
  const max = Math.max(1, ...byHour);
  const total = bands.reduce((s, b) => s + b.total, 0);
  const peak = byHour.indexOf(Math.max(...byHour));
  if (!lines.length && !bands.length) return null;
  return (
    <div className="dp" data-testid="ai-explain">
      {lines.length ? (
        <section className="dp__plain b-glass b-pad">
          <div className="ai-card__top"><p className="b-label">Explained simply</p><span className="ai-tag">From today&apos;s data</span></div>
          <ol className="dp__lines">{lines.map((l, i) => <li key={i}><span className="dp__n">{i + 1}</span><span>{l}</span></li>)}</ol>
        </section>
      ) : null}
      {bands.length && total > 0 ? (
        <section className="dp__pic b-glass b-pad" data-testid="ai-picture">
          <p className="b-label">The day in a picture</p>
          <div className="dp__chart">
            <p className="dp__k">Money from $1M+ wallets, hour by hour (last {hours} hours)</p>
            <svg className="dp__hours" viewBox={`0 0 ${hours * 10} 80`} preserveAspectRatio="none" role="img" aria-label={`Money by hour; the busiest hour had ${dollars(byHour[peak] ?? 0)}`}>
              {byHour.map((v, h) => <rect key={h} x={h * 10 + 1.5} y={80 - (v / max) * 76} width={7} height={Math.max(v > 0 ? 2 : 0.6, (v / max) * 76)} rx={1.5} className={h === peak ? "dp__bar dp__bar--peak" : "dp__bar"} />)}
            </svg>
            <p className="dp__axis"><span>{hours}h ago</span><span>Busiest hour: {dollars(byHour[peak] ?? 0)}</span><span>Now</span></p>
          </div>
          <div className="dp__chart">
            <p className="dp__k">Where the money went</p>
            <ul className="dp__cats">
              {bands.map(b => (
                <li key={b.category}>
                  <span className="dp__cat">{catName(b.category)}</span>
                  <span className="dp__track"><span className="dp__fill" style={{ width: `${Math.max(2, (b.total / bands[0]!.total) * 100)}%` }} /></span>
                  <span className="dp__v b-num">{dollars(b.total)} <small>{pct(b.total / total)}</small></span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

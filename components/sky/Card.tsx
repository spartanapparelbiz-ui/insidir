/* A market card, identical anatomy for every market so cards line up at equal heights with no empty space:
 *   1. imagery row: two team logos, portraits or party rings, or a logo or line icon (components/sky/Art.tsx), with the
 *      category on the right
 *   2. the title, two lines at most
 *   3. money: proven money's split in dollars; else "Big money: $X on {side}"; else "No big bets in 24 hours"
 *   4. the price and 24h volume, in Plex Mono (the volume only when the venue reports it)
 * The whole card opens its Read in one tap. Also: the split bar, shared with the Read and the dashboard. */
import { ReadPick } from "@/components/read/ReadPick";
import { CATS, type MarketCard as CardT } from "@/lib/nx/data";
import { fmt } from "@/lib/nx/fmt";
import { artFor } from "@/lib/sky/art";
import { Art } from "./Art";
import { Tick } from "./Tick";

export function SplitBar({ yes, no, yesLabel, noLabel }: { yes: number; no: number; yesLabel: string; noLabel: string }) {
  const total = yes + no;
  if (total <= 0) return null;
  const y = Math.round((yes / total) * 100);
  // All on one side: say so in words rather than draw a full bar against "$0".
  if (yes <= 0 || no <= 0) {
    const [dollars, label] = yes > 0 ? [yes, yesLabel] : [no, noLabel];
    return <span className="sk-card__big" data-testid="sk-split-one">Proven money: <b><Tick value={dollars} /></b>, all on {label}</span>;
  }
  return (
    <div className="sk-split" role="img" aria-label={`Proven money: ${fmt(yes, "usd")} on ${yesLabel}, ${fmt(no, "usd")} on ${noLabel}`}>
      <div className="sk-split__bar" aria-hidden="true"><i className="y" style={{ width: `${y}%` }} /><i className="n" style={{ width: `${100 - y}%` }} /></div>
      <div className="sk-split__legend"><span><b><Tick value={yes} /></b> {yesLabel}</span><span>{noLabel} <b><Tick value={no} /></b></span></div>
    </div>
  );
}

/** The side most of the tracked big money is on, and how much. */
export const bigSide = (c: Pick<CardT, "money" | "yesLabel" | "noLabel">) => (c.money.yes >= c.money.no ? { label: c.yesLabel, dollars: c.money.yes } : { label: c.noLabel, dollars: c.money.no });

export function MarketCard({ c, size = 40 }: { c: CardT; size?: number }) {
  const cat = CATS.find(x => x.key === c.cat)?.label;
  const big = bigSide(c);
  return (
    <ReadPick venue={c.venue} id={c.id} className="sk-card">
      <span className="sk-card__top"><Art art={artFor({ tab: c.tab, league: c.league, title: c.title, event: c.event, cat: c.cat, yesLabel: c.yesLabel, noLabel: c.noLabel })} size={size} />{cat ? <span className="sk-card__cat">{cat}</span> : null}</span>
      <span className="sk-card__t" data-testid="sk-card-title">{c.title}</span>
      <span className="sk-card__money" data-testid="sk-card-money">
        {c.proven.yes + c.proven.no > 0 ? <SplitBar yes={c.proven.yes} no={c.proven.no} yesLabel={c.yesLabel} noLabel={c.noLabel} />
          : big.dollars > 0 ? <span className="sk-card__big">Big money: <b>{fmt(big.dollars, "usd")}</b> on {big.label}</span>
          : <span className="sk-card__big">No big bets in 24 hours</span>}
      </span>
      <span className="sk-card__foot">
        {c.yesPrice !== null ? <span className="sk-card__price" data-testid="sk-card-price"><Tick value={c.yesPrice} format="cents" /><small>{c.yesLabel}</small></span> : <span className="sk-card__price"><small>{c.yesLabel}</small></span>}
        {c.volume24h ? <span className="sk-card__vol">{fmt(c.volume24h, "usd")} 24h vol</span> : null}
      </span>
    </ReadPick>
  );
}

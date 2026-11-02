/* Small server pieces of the design system: the sparkline, the split bar, the photo behind a hero or banner, and a
 * market card. */
import { photoInfo, type PhotoName } from "@/lib/photos";
import { url } from "@/lib/unsplash";
import type { MarketCard as Card } from "@/lib/nx/data";
import { CATS } from "@/lib/nx/data";
import { ReadPick } from "@/components/read/ReadPick";
import { Photo } from "@/components/Photo";
import { fmt } from "@/lib/nx/fmt";
import { Tick } from "./Tick";

/** A sparkline from real price history; nothing when there are fewer than two points. */
export function Spark({ points, className = "nx-spark" }: { points: readonly number[]; className?: string }) {
  if (points.length < 2) return null;
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 96).toFixed(1)},${(26 - ((p - lo) / span) * 24).toFixed(1)}`).join(" ");
  const down = points[points.length - 1]! < points[0]!;
  return <svg className={`${className}${down ? " is-down" : ""}`} viewBox="0 0 96 28" preserveAspectRatio="none" role="img" aria-label={`Price over the last week, ${down ? "down" : "up"}`}><path d={d} /></svg>;
}

/** YES vs NO as a bar with the dollars on each side; nothing without money. */
export function SplitBar({ yes, no, yesLabel, noLabel, what = "proven" }: { yes: number; no: number; yesLabel: string; noLabel: string; what?: string }) {
  const total = yes + no;
  if (total <= 0) return null;
  const y = Math.round((yes / total) * 100);
  return (
    <div className="nx-split" role="img" aria-label={`${what} money: ${fmt(yes, "usd")} on ${yesLabel}, ${fmt(no, "usd")} on ${noLabel}`}>
      <div className="nx-split__bar" aria-hidden="true"><i className="y" style={{ width: `${y}%` }} /><i className="n" style={{ width: `${100 - y}%` }} /></div>
      <div className="nx-split__legend"><span><b><Tick value={yes} /></b> {yesLabel}</span><span>{noLabel} <b><Tick value={no} /></b></span></div>
    </div>
  );
}

/** A full-bleed photo: a tall crop for phones and a wide one for larger screens, both around the photo's focal point. */
export function HeroPhoto({ name, priority = false }: { name: PhotoName; priority?: boolean }) {
  const p = photoInfo(name);
  const at = (w: number, h: number) => url(p.id, { w, h, fx: p.fx, fy: p.fy, q: 80 });
  return (
    <div className="nx-photo" style={{ backgroundColor: p.color }} data-photo={name}>
      <picture>
        <source media="(max-width: 600px)" srcSet={`${at(390, 600)} 390w, ${at(780, 1200)} 780w, ${at(1170, 1800)} 1170w`} sizes="100vw" />
        <img src={at(1440, 760)} srcSet={`${at(1024, 540)} 1024w, ${at(1440, 760)} 1440w, ${at(1920, 1013)} 1920w, ${at(2880, 1520)} 2880w`} sizes="100vw"
          alt="" width={1440} height={760} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
      </picture>
    </div>
  );
}

/** One market as a card that opens its Read in one tap: photo (or the two team logos), title, the proven-money split
 *  in dollars (or, with none, every tracked large position's, labelled as that), the price, 24h volume, and a sparkline
 *  when there's real history. */
export function MarketCard({ c, priority = false }: { c: Card; priority?: boolean }) {
  const cat = CATS.find(x => x.key === c.cat)?.label;
  return (
    <ReadPick venue={c.venue} id={c.id} className="nx-card nx-panel">
      <span className="nx-card__img" aria-hidden="true">
        <Photo name={c.photo} ratio="16:9" sizes="(min-width: 768px) 300px, 82vw" priority={priority} />
        {c.logos ? <span className="nx-card__logos">{c.logos.map(l => <img key={l} src={l} alt="" width={32} height={32} loading="lazy" />)}</span> : null}
        {cat ? <span className="nx-card__cat nx-label">{cat}</span> : null}
      </span>
      <span className="nx-card__body" data-testid="nx-card">
        <span className="nx-card__t">{c.title}</span>
        {c.proven.yes + c.proven.no > 0
          ? <span className="nx-card__split"><span className="nx-label">Proven money</span><SplitBar yes={c.proven.yes} no={c.proven.no} yesLabel={c.yesLabel} noLabel={c.noLabel} /></span>
          : c.money.yes + c.money.no > 0
            ? <span className="nx-card__split"><span className="nx-label">Big money · no proven money yet</span><SplitBar yes={c.money.yes} no={c.money.no} yesLabel={c.yesLabel} noLabel={c.noLabel} what="big" /></span>
            : null}
        <span className="nx-card__foot">
          <span>
            {c.yesPrice !== null ? <span className="nx-card__price" data-testid="nx-card-price"><Tick value={c.yesPrice} format="cents" /><small>{c.yesLabel}</small></span> : null}
            {c.volume24h ? <span className="nx-card__vol" style={{ display: "block" }}>{fmt(c.volume24h, "usd")} 24h volume</span> : null}
          </span>
          <Spark points={c.spark} />
        </span>
      </span>
    </ReadPick>
  );
}

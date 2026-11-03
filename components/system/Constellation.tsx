/* The wallet constellation: every millionaire wallet that bet today is a star. Bigger: more money in today. Nearer the
 * centre: more all-time profit. Each category has its own sector of the sky. A line joins two wallets that bet the same
 * market (solid on the same side, dashed against each other). Stars pop in and lines draw as the stage enters; at rest
 * everything is drawn. Never a face: a dot and a short address. Each star opens its wallet's page. */
import type { CSSProperties } from "react";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import type { Constellation as Data } from "@/lib/home/data";
import { dollars } from "@/lib/money";

const W = 1000, H = 620, CX = W / 2, CY = H / 2;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
/** A stable 0..1 from a wallet address, so a star keeps its place between visits. */
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
const name = (c: string) => (isCategory(c) ? categoryInfo(c).name : c);

export function Constellation({ data, testid = "constellation" }: { data: Data; testid?: string }) {
  const { stars, links } = data;
  if (stars.length < 3) return null;
  // Sectors: categories by how many stars they hold, each an arc in proportion.
  const cats = [...new Set(stars.map(s => s.category))].sort((a, b) => stars.filter(s => s.category === b).length - stars.filter(s => s.category === a).length);
  const span = (2 * Math.PI) / stars.length;
  let a0 = -Math.PI / 2;
  const sector = new Map<string, { from: number; to: number }>();
  for (const c of cats) { const n = stars.filter(s => s.category === c).length; sector.set(c, { from: a0, to: a0 + n * span }); a0 += n * span; }
  // Radius by all-time profit rank (the most profitable nearest the centre).
  const byPnl = [...stars].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0)).map(s => s.wallet);
  const maxMoney = Math.max(...stars.map(s => s.money), 1);
  const pos = new Map<string, { x: number; y: number; r: number }>();
  const seen = new Map<string, number>();
  for (const s of stars) {
    const sec = sector.get(s.category)!, i = seen.get(s.category) ?? 0, n = stars.filter(x => x.category === s.category).length;
    seen.set(s.category, i + 1);
    const ang = sec.from + (sec.to - sec.from) * ((i + 0.5) / n) + (hash(s.wallet) - 0.5) * span * 0.5;
    const rank = byPnl.indexOf(s.wallet) / Math.max(1, stars.length - 1);
    const rad = 0.16 + 0.76 * rank + (hash(s.wallet + "r") - 0.5) * 0.08;
    pos.set(s.wallet, { x: CX + Math.cos(ang) * rad * (W / 2 - 40), y: CY + Math.sin(ang) * rad * (H / 2 - 30), r: 4 + 12 * Math.sqrt(s.money / maxMoney) });
  }
  const labelled = new Set([...stars].sort((a, b) => b.money - a.money).slice(0, 5).map(s => s.wallet));
  const gold = new Set([...stars].sort((a, b) => b.money - a.money).slice(0, 3).map(s => s.wallet));
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
  return (
    <figure className="s-const" data-testid={testid} role="img" aria-label={`${stars.length} millionaire wallets that bet today, joined by ${links.length} shared markets.`}>
      <div className="s-const__sky">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {[0.33, 0.66, 0.99].map(k => <ellipse key={k} cx={CX} cy={CY} rx={k * (W / 2 - 40)} ry={k * (H / 2 - 30)} className="s-const__ring" />)}
          {links.map((l, i) => {
            const p = pos.get(l.a), q = pos.get(l.b);
            return p && q ? <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`s-const__link s-draw${l.same ? "" : " s-const__link--against"}`} pathLength={1}><title>{l.title}</title></line> : null;
          })}
          {stars.map((s, i) => {
            const p = pos.get(s.wallet)!;
            return (
              <a key={s.wallet} href={`/p/${s.wallet}`}>
                <title>{`${s.short} · ${s.pnl !== null ? `${signed(s.pnl)} all-time · ` : ""}${dollars(s.money)} today on ${s.bets} ${s.bets === 1 ? "bet" : "bets"} · ${name(s.category)}`}</title>
                <circle cx={p.x} cy={p.y} r={p.r} className={`s-const__star s-pop${gold.has(s.wallet) ? " s-const__star--gold" : ""}`} style={{ "--at": (i / stars.length).toFixed(2) } as CSSProperties} />
              </a>
            );
          })}
        </svg>
        {cats.slice(0, 8).map(c => {
          const sec = sector.get(c)!, mid = (sec.from + sec.to) / 2;
          return <span key={c} className="s-const__cat b-small" style={{ left: pct(CX + Math.cos(mid) * (W / 2 - 10), W), top: pct(CY + Math.sin(mid) * (H / 2 - 4), H) } as CSSProperties}>{name(c)}</span>;
        })}
        {stars.filter(s => labelled.has(s.wallet)).map(s => {
          const p = pos.get(s.wallet)!;
          return <span key={s.wallet} className="s-const__lbl b-small b-num" style={{ left: pct(p.x, W), top: pct(p.y + p.r + 4, H) } as CSSProperties}>{s.short}</span>;
        })}
      </div>
      <figcaption className="b-small s-const__key">Bigger star: more money in today. Nearer the centre: more all-time profit. A line: two wallets on the same market, solid on the same side, dashed against each other.</figcaption>
    </figure>
  );
}

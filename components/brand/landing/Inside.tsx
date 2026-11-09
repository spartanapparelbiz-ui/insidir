/* The landing's "What's inside": the four AI tools members use, each shown with its real output from today's data, as a
 * visitor may see it (side-neutral, lib/briefing/gate.ts; the brief's visitor lines are 60 minutes late and carry no
 * side). A card with nothing real to show describes the tool only. Information, not advice. Server only. */
import type { CSSProperties } from "react";
import { getDb, hasDatabase } from "@/lib/db";
import { getBriefing } from "@/lib/briefing/store";
import { gateBriefing } from "@/lib/briefing/gate";
import { buildBrief } from "@/lib/brief/build";
import type { LandingData } from "@/lib/brand/landing";
import { Lines, m, Pill } from "../Bits";
import { Stage } from "../Stage";
import { PLANS, TRIAL } from "@/lib/plans";

const within = <T,>(p: Promise<T>, ms: number, d: T): Promise<T> => Promise.race([p.catch(() => d), new Promise<T>(r => setTimeout(() => r(d), ms))]);
const KEYS: Record<string, string> = { rules: "Wins if", cost: "Costs and pays", read: "The read" };
const ASKS = ["Who's the best NFL wallet this month?", "Is anyone big against my bet?", "Why did the odds move?"];

async function sample(d: LandingData) {
  if (!hasDatabase()) return { briefing: null, brief: [] as string[][] };
  const db = getDb();
  const ids = [d.topBet, ...d.lead].filter((b): b is NonNullable<typeof b> => !!b && b.result === null).map(b => b.marketId);
  const briefing = await within((async () => {
    for (const id of [...new Set(ids)].slice(0, 3)) {
      const b = await getBriefing(db, id, d.now).catch(() => null);
      if (!b || b.result) continue;
      const g = gateBriefing(b, false);
      const lines = g.sections.filter(s => KEYS[s.key] && s.lines[0]).map(s => ({ k: KEYS[s.key]!, t: s.lines[0]! }));
      if (lines.length) return { title: b.title, lines };
    }
    return null;
  })(), 5000, null);
  const brief = await within(buildBrief(db, d.now, { member: false, useModel: false }).then(b => b.items.slice(0, 2).map(i => [...i.lines])), 3000, [] as string[][]);
  return { briefing, brief };
}

export async function InsideStage({ d }: { d: LandingData }) {
  const s = await sample(d);
  const card = (i: number) => ({ "--d": `${0.45 + i * 0.08}s` }) as CSSProperties;
  return (
    <Stage testid="inside" labelledBy="inside-h" className="b-stage--inside">
      <div className="b-head">
        <p className="in-k in-k--lead" {...m("lift", 0.2)}>Not just data</p>
        <Lines id="inside-h" lines={["Your AI analyst."]} size={64} />
        <p className="b-sub" {...m("lift", 0.4)}>It reads every $1M+ bet for you and tells you, in plain words, what it means for yours: before you bet, while you hold, and when it settles. Written from our data only, every number verified against it.</p>
      </div>
      <div className="in-grid" data-testid="inside-tools">
        <article className="b-glass in-card in-card--wide" data-m="settle" style={card(0)}>
          <p className="in-k">Bet Briefing</p>
          <h3 className="in-h">Before you bet, know what you&apos;re betting on.</h3>
          <p className="in-t">Paste any Polymarket or Kalshi link: what it needs to win, what it costs and pays, who&apos;s on each side and how they&apos;re playing it.</p>
          {s.briefing ? (
            <div className="in-sample">
              <span className="in-sample__top">Live sample · {s.briefing.title}</span>
              {s.briefing.lines.map(l => <span key={l.k} className="in-sample__row"><b>{l.k}</b><span>{l.t}</span></span>)}
            </div>
          ) : null}
        </article>
        <article className="b-glass in-card" data-m="settle" style={card(1)}>
          <p className="in-k">Daily Brief</p>
          <h3 className="in-h">What the big money did overnight.</h3>
          <p className="in-t">The five biggest moves by 8 AM, two lines each, and what changed on your bets.</p>
          {s.brief.length ? <div className="in-lines">{s.brief.map((l, i) => <p key={i}>{l[0]}<span>{l[1]}</span></p>)}</div> : null}
        </article>
        <article className="b-glass in-card" data-m="settle" style={card(2)}>
          <p className="in-k">Watch my bet</p>
          <h3 className="in-h">An alert when it matters to you.</h3>
          <p className="in-t">Add your position. When a $1M+ wallet takes the other side, one on your side gets out, or the price moves 5¢, you hear it, with what it means in dollars.</p>
        </article>
        <article className="b-glass in-card" data-m="settle" style={card(3)}>
          <p className="in-k">Ask Insidir</p>
          <h3 className="in-h">Ask it anything about the money.</h3>
          <p className="in-t">Answers come only from our data, with the rows behind them. If we don&apos;t have it, it says so.</p>
          <ul className="in-asks">{ASKS.map(q => <li key={q}>{q}</li>)}</ul>
        </article>
      </div>
      <div className="in-cta" data-m="settle" style={card(4)}>
        <div className="b-ctas"><Pill href="/go?step=cats" data-checkout="inside" data-testid="inside-start">Start for $1</Pill></div>
        <p className="b-small">{`$${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price} a month. Cancel anytime. The AI analyst is included.`}</p>
      </div>
    </Stage>
  );
}

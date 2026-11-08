/* The landing's live value stages (data: lib/brand/pulse.ts, lib/brand/landing.ts). Every block renders complete on
 * the server: numbers final, bars at their real length, every card in its slot, so the page is whole at rest and
 * without JavaScript. Motion (components/brand/landing/ScrollFx.tsx) only adds a starting state to what is still
 * below the viewport once the reader starts to scroll: [data-count] numbers count up, [data-bar] bars fill from 0,
 * [data-stagger] rows come in one by one, the Pulse's [data-slot] cards slide into their grid slots.
 * Free parts are whole; locked parts never carry their side or numbers, and each stage has one "Start for $1". */
import type { ReactNode } from "react";
import type { LandingData } from "@/lib/brand/landing";
import { mil } from "@/lib/brand/pulse";
import { heavierSide, verdict } from "@/lib/brand/verdict";
import { MEMBERS, PAST, STAGES } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import { dollars } from "@/lib/money";
import { cents, Lines, Pill, Side, signedDollars, TierBadge } from "../Bits";
import { Stage } from "../Stage";
import { ElectionLive } from "./ElectionLive";
import { LiveFeed } from "../LiveFeed";
import { StakeSlider } from "./StakeSlider";


const pct = (v: number) => `${Math.round(v * 100)}%`;

/* ---------- 1. The Pulse ---------- */

export function PulseStage({ d }: { d: LandingData }) {
  const p = d.pulse2, h = p.hottest, b = p.biggest, dis = p.disagree.free, u = p.unusual;
  const hShare = h ? (h.millionaire.yes.dollars / Math.max(1, mil(h))) : 0;
  return (
    <Stage testid="pulse" labelledBy="pulse-h" className="b-stage--pulse">
      <div className="b-head"><Lines id="pulse-h" lines={STAGES.pulse} size={64} /></div>
      <div className="b-dash" data-testid="pulse-dash" data-pin="pulse">
        <section className="b-dcard b-glass b-dcard--total" data-slot="0" data-testid="pulse-total">
          <span className="b-label">Millionaire money today</span>
          {p.today > 0
            ? <p className="b-dbig b-num" data-count={Math.round(p.today)} data-fmt="usd">{dollars(p.today)}</p>
            : <p className="b-empty">No millionaire money yet today. It shows the second a $1M+ wallet bets.</p>}
          <span className="b-small">Bet by wallets up $1M+ since midnight ET.</span>
        </section>
        <section className="b-dcard b-glass" data-slot="1" data-testid="pulse-biggest">
          <span className="b-label">Biggest bet today</span>
          {b ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p className="b-dmid b-num" data-count={Math.round(b.amount)} data-fmt="usd">{dollars(b.amount)}</p>
              <span className="b-dtitle">{b.title}</span>
              <span className="b-row__meta"><TierBadge tier={b.tier} />{b.pnl !== null ? <span>{signedDollars(b.pnl)} wallet</span> : null}<Side outcome={b.outcome} side={b.side} /></span>
            </div>
          ) : <p className="b-empty">No millionaire bet yet today.</p>}
        </section>
        <section className="b-dcard b-glass" data-slot="2" data-testid="pulse-hottest">
          <span className="b-label">Hottest market</span>
          {h ? (
            <div style={{ display: "grid", gap: 8 }}>
              <span className="b-dtitle">{h.title}</span>
              <p className="b-dmid b-num" data-count={Math.round(mil(h))} data-fmt="usd">{dollars(mil(h))}</p>
              <div className="b-bar" role="img" aria-label={`${pct(hShare)} of it on ${h.yesLabel}`}><span data-bar={hShare.toFixed(3)} style={{ transform: `scaleX(${hShare})` }} /></div>
              <span className="b-kv b-small"><span>{h.yesLabel} {h.millionaire.yes.dollars ? dollars(h.millionaire.yes.dollars) : "no money yet"}</span><span>{h.noLabel} {h.millionaire.no.dollars ? dollars(h.millionaire.no.dollars) : "no money yet"}</span></span>
            </div>
          ) : <p className="b-empty">No market has millionaire money today yet.</p>}
        </section>
        <section className="b-dcard b-glass b-dcard--wide" data-slot="3" data-testid="pulse-disagree">
          <span className="b-label">Where millionaires disagree with the price</span>
          {dis ? (
            <div style={{ display: "grid", gap: 10 }}>
              <span className="b-dtitle">{dis.title}</span>
              <div className="b-gap" data-testid="disagree-free">
                <div className="b-gap__row"><span>Millionaires <b className="b-num">{pct(dis.share)}</b> on {dis.outcome}</span><span className="b-bar b-bar--up"><span data-bar={dis.share.toFixed(3)} style={{ transform: `scaleX(${dis.share})` }} /></span></div>
                <div className="b-gap__row"><span>Price <b className="b-num">{cents(dis.price)}</b></span><span className="b-bar b-bar--dim"><span data-bar={dis.price.toFixed(3)} style={{ transform: `scaleX(${dis.price})` }} /></span></div>
              </div>
              <span className="b-small">{dollars(dis.dollars)} from {dis.wallets} {dis.wallets === 1 ? "wallet" : "wallets"} up $1M+. The price says {cents(dis.price)}. Information, not advice.</span>
              {p.disagree.locked.length ? (
                <ul className="b-rows" data-stagger="" data-testid="disagree-locked">{p.disagree.locked.map((l, i) => (
                  <li key={i} className="b-small" data-locked="row">A {l.categoryName.toLowerCase()} market where they disagree with the price: members see which one.</li>
                ))}</ul>
              ) : null}
            </div>
          ) : <p className="b-empty">No market right now where millionaire money and the price disagree. When 70%+ of it sits on a side priced 50¢ or less, it shows here.</p>}
        </section>
        <section className="b-dcard b-glass" data-slot="4" data-testid="pulse-unusual">
          <span className="b-label">Unusual bet of the day</span>
          {u ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p className="b-dmid"><span className="b-num">{dollars(u.amount)}</span> at <span className="b-num">{cents(u.price)}</span></p>
              <span className="b-dtitle">{u.title}</span>
              <span className="b-small">A new wallet, a long shot: <span className="b-side">{u.outcome}</span></span>
            </div>
          ) : <p className="b-empty">No unusual bet today yet: a new wallet betting $5K+ at 25¢ or less shows here.</p>}
        </section>
      </div>
      <div className="b-center" style={{ marginTop: 22 }}><div className="b-ctas"><Pill href="/go" data-testid="pulse-start" data-checkout="pulse">Start for $1</Pill></div></div>
    </Stage>
  );
}

/* ---------- 2. Election Day board ---------- */

export function ElectionStage({ d }: { d: LandingData }) {
  if (!d.election) return null;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("election"), dark: 0.6 }} testid="election" labelledBy="election-h">
      <div className="b-head"><Lines id="election-h" lines={STAGES.election} size={64} /></div>
      <ElectionLive initial={d.election} member={d.member} />
      {d.member ? null : <div className="b-center" style={{ marginTop: 22 }}><div className="b-ctas"><Pill href="/go" data-testid="election-start" data-checkout="election">Start for $1</Pill></div></div>}
    </Stage>
  );
}

/* ---------- The home's lead after Election Day: the board ---------- */

export function BoardLeadStage({ d }: { d: LandingData }) {
  return (
    <Stage testid="lead-board" labelledBy="lead-h">
      <div className="b-head"><Lines id="lead-h" lines={["Every millionaire bet."]} size={60} />
        {d.member ? null : <p className="b-sub">Live now: <b className="b-num">{d.pulse.countToday}</b> today. Here 60 minutes late; members see each one the second it lands.</p>}</div>
      <LiveFeed initial={{ now: d.now, pulse: d.pulse, bets: d.lead }} n={8} board copy={d.member} />
      <div className="b-center" style={{ marginTop: 18 }}><div className="b-ctas">{d.member ? <Pill href="/board" kind="ghost">The whole board</Pill> : <Pill href="/go" data-testid="lead-start" data-checkout="lead">Start for $1</Pill>}</div></div>
    </Stage>
  );
}

/* ---------- 3. What members get: the sticky phone ---------- */

function Phone({ children, i }: { children: ReactNode; i: number }) {
  return <div className="b-screen" data-screen={i}>{children}</div>;
}

export function MembersStage({ d }: { d: LandingData }) {
  const t = d.top;
  const side = t ? heavierSide({ ...t.m.millionaire, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel }) : null;
  const v = t && side ? verdict({ yes: t.m.millionaire.yes, no: t.m.millionaire.no, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel }, side) : null;
  const screens: ReactNode[] = [
    // A market: who the millionaires back, and the price
    t && v ? (
      <div className="b-ph" data-testid="screen-market">
        <span className="b-ph__label">A market</span>
        <span className="b-ph__title">{t.m.title}</span>
        <span className="b-ph__pills"><span className="b-ph__pill is-on">{side === "yes" ? t.m.yesLabel : t.m.noLabel}</span><span className="b-ph__pill">{side === "yes" ? t.m.noLabel : t.m.yesLabel}</span></span>
        <span className="b-ph__verdict" style={{ color: v.kind === "agree" ? "var(--up)" : v.kind === "against" ? "var(--down)" : "#fff" }}>{v.kind === "agree" ? "✓ " : v.kind === "against" ? "✕ " : ""}{v.headline}</span>
        {v.evidence ? <span className="b-ph__small">{v.evidence}</span> : null}
        {t.m.priceNow !== null ? <><span className="b-ph__label" style={{ marginTop: 6 }}>Price now</span><div className="b-ph__row"><span>{t.m.yesLabel}</span><b className="b-num">{cents(t.m.priceNow)}</b></div><div className="b-ph__row"><span>{t.m.noLabel}</span><b className="b-num">{cents(1 - t.m.priceNow)}</b></div></> : null}
        <span className="b-ph__label" style={{ marginTop: 6 }}>Millionaire money</span>
        <div className="b-ph__row"><span>{t.m.yesLabel}</span><b className="b-num">{t.m.millionaire.yes.dollars ? dollars(t.m.millionaire.yes.dollars) : "no money yet"}</b></div>
        <div className="b-ph__row"><span>{t.m.noLabel}</span><b className="b-num">{t.m.millionaire.no.dollars ? dollars(t.m.millionaire.no.dollars) : "no money yet"}</b></div>
      </div>
    ) : <div className="b-ph"><span className="b-ph__small">A market shows here once one has millionaire money.</span></div>,
    // The live board, a ping sliding in
    <div className="b-ph" data-testid="screen-board" key="board">
      <span className="b-ph__label"><span className="b-dot" aria-hidden="true" /> Live board</span>
      {d.board.length ? d.board.slice(0, 3).map(b => <div key={b.id} className="b-ph__row"><span>{b.title}</span><b className="b-num">{dollars(b.amount)}</b></div>) : <span className="b-ph__small">No millionaire bet in the last hours.</span>}
      {d.biggest ? <div className="b-ph__ping" data-testid="screen-ping"><b>Insidir</b><span>A {d.biggest.pnl !== null ? `${signedDollars(d.biggest.pnl)} ` : ""}wallet just bet {dollars(d.biggest.amount)} on {d.biggest.title}</span></div> : null}
    </div>,
    // The Daily Brief
    <div className="b-ph" data-testid="screen-brief" key="brief">
      <span className="b-ph__label">Daily Brief</span>
      {d.brief.length ? d.brief.map((m, i) => <div key={m.marketId} className="b-ph__row"><span>{i + 1}. {m.title}</span><b className="b-num">{dollars(mil(m))}</b></div>) : <span className="b-ph__small">No millionaire money yet today.</span>}
    </div>,
    // A followed wallet
    <div className="b-ph" data-testid="screen-wallet" key="wallet">
      <span className="b-ph__label">Following</span>
      {d.wallet ? (
        <>
          <span className="b-ph__pills"><TierBadge tier={d.wallet.tier} /><span className="b-ph__small">{d.wallet.short}</span></span>
          <span className="b-ph__big b-up b-num">{signedDollars(d.wallet.pnl)}</span>
          <span className="b-ph__pills">{d.wallet.results.slice(0, 5).map((r, i) => <span key={i} className="b-ph__pill" style={{ color: r.result === "won" ? "var(--up)" : r.result === "lost" ? "var(--down)" : undefined }}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Void"}</span>)}</span>
        </>
      ) : <span className="b-ph__small">Follow a wallet up millions: its bets land here.</span>}
    </div>,
    // Big nights
    <div className="b-ph" data-testid="screen-live" key="live">
      <span className="b-ph__label"><span className="b-dot" aria-hidden="true" /> Tonight</span>
      {d.bigNight ? <><span className="b-ph__title">{d.bigNight.title}</span><span className="b-ph__big b-num">{dollars(mil(d.bigNight))}</span><span className="b-ph__small">millionaire money · {d.bigNight.millionaire.yes.wallets + d.bigNight.millionaire.no.wallets} wallets</span></>
        : <span className="b-ph__small">No race or game has millionaire money right now.</span>}
    </div>,
  ];
  return (
    <Stage testid="members" labelledBy="members-h" className="b-stage--story">
      <div className="b-head"><Lines id="members-h" lines={STAGES.members} size={60} /></div>
      <div className="b-story" data-story="">
        <ol className="b-story__steps">
          {MEMBERS.map((f, i) => (
            <li key={f.k} className="b-step" data-step={i} data-testid="member-row">
              <span className="b-label">{f.when}</span>
              <p className="b-feat__t">{f.t}</p>
              <div className="b-step__screen" aria-hidden="true"><div className="b-phone b-phone--mini">{screens[i]}</div></div>
            </li>
          ))}
        </ol>
        <div className="b-story__phone" aria-label="What a member sees" role="img">
          <div className="b-phone" data-active="0" data-testid="phone">
            <span className="b-phone__notch" aria-hidden="true" />
            {screens.map((s, i) => <Phone key={i} i={i}>{s}</Phone>)}
          </div>
        </div>
      </div>
      <div className="b-center" style={{ marginTop: 24 }}>
        <div className="b-ctas"><Pill href="/go" data-testid="members-start" data-checkout="members">Start for $1</Pill></div>
        <p className="b-small" style={{ marginTop: 10 }}>$1 for 3 days, then $39/month.</p>
      </div>
    </Stage>
  );
}

/* ---------- 4. Wallet spotlight ---------- */

export function SpotlightStage({ d }: { d: LandingData }) {
  const s = d.spotlight;
  if (!s) return null;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("spotlight"), dark: 0.6 }} testid="spotlight" labelledBy="spotlight-h">
      <div className="b-head"><Lines id="spotlight-h" lines={STAGES.spotlight} size={64} /></div>
      <div className="b-col b-glass b-pad" style={{ maxWidth: "min(100%, calc(820 * var(--u)))", margin: "0 auto", display: "grid", gap: 14 }}>
        <div className="b-kv" style={{ flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}><TierBadge tier={s.tier} /><span className="b-small">{s.short}</span></span>
          <span className="b-up b-num" style={{ fontWeight: 600 }} data-testid="spotlight-pnl">{signedDollars(s.pnl)} all-time</span>
        </div>
        <p style={{ margin: 0, fontWeight: 500, fontSize: 17 }} data-testid="spotlight-summary">Its last {s.rows.length} closed bets: <span className="b-num">{s.won}</span> made money, <span className="b-num">{s.rows.length - s.won}</span> lost money.</p>
        <ul className="b-rows" data-stagger="" data-testid="spotlight-rows">
          {s.rows.map((r, i) => (
            <li key={i} className="b-row b-srow" data-testid="spotlight-row" data-result={r.won ? "won" : "lost"}>
              <span className="b-row__main"><span className="b-row__title">{r.title}</span><span className="b-row__meta">{r.outcome ? <span className="b-side">{r.outcome}</span> : null}{r.price !== null ? <span>at {cents(r.price)}</span> : null}<span>{dollars(r.moneyIn)} in</span></span></span>
              <span className={`b-res ${r.won ? "b-res--won" : "b-res--lost"}`}>{r.won ? "Made" : "Lost"} <span className="b-num">{signedDollars(r.pnl)}</span></span>
            </li>
          ))}
        </ul>
        <p className="b-small">Its closed positions on Polymarket (held to the end or sold), newest first, losses included. {PAST}</p>
      </div>
      <div className="b-center" style={{ marginTop: 22 }}><div className="b-ctas"><Pill href="/go" kind="ghost" data-testid="spotlight-start" data-checkout="spotlight">Follow wallets like this</Pill></div><p className="b-small" style={{ marginTop: 10 }}>Following is for members: $1 for 3 days.</p></div>
    </Stage>
  );
}

/* ---------- 5. Your stake ---------- */

export function StakeStage({ d }: { d: LandingData }) {
  if (!d.stake) return null;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("stake"), dark: 0.6 }} testid="stake" labelledBy="stake-h">
      <div className="b-head"><Lines id="stake-h" lines={STAGES.stake} size={64} /></div>
      <StakeSlider r={d.stake} />
    </Stage>
  );
}

/* ---------- 6. Price gaps ---------- */

export function GapsStage({ d }: { d: LandingData }) {
  if (!d.gaps.length) return null;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("gaps"), dark: 0.66 }} testid="gaps" labelledBy="gaps-h">
      <div className="b-head"><Lines id="gaps-h" lines={STAGES.gaps} size={64} /></div>
      <ul className="b-cards3" data-stagger="" data-testid="gap-rows" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {d.gaps.map((g, i) => (
          <li key={i} className="b-glass b-pad" data-testid="gap-row" style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <span className="b-dtitle">{g.title}</span>
            <span className="b-small">Same bet: <b className="b-num" style={{ color: "#fff" }}>{cents(g.kalshi)}</b> on Kalshi, <b className="b-num" style={{ color: "#fff" }}>{cents(g.polymarket)}</b> on Polymarket</span>
            <div className="b-gap">
              <div className="b-gap__row"><span>Kalshi</span><span className="b-bar b-bar--dim"><span data-bar={g.kalshi.toFixed(3)} style={{ transform: `scaleX(${g.kalshi})` }} /></span></div>
              <div className="b-gap__row"><span>Polymarket</span><span className="b-bar b-bar--dim"><span data-bar={g.polymarket.toFixed(3)} style={{ transform: `scaleX(${g.polymarket})` }} /></span></div>
            </div>
            <span className="b-label">A <span className="b-num">{Math.round(g.gap * 100)}¢</span> difference on {g.outcome}</span>
          </li>
        ))}
      </ul>
      <p className="b-small" style={{ textAlign: "center", marginTop: 14 }}>What buying it costs on each venue now, refreshed every minute. Fees and rules differ by venue. Information, not advice.</p>
    </Stage>
  );
}

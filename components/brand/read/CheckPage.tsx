/* The check page (/read/<id>) in the brand's language: a stage header (the market's category photo, the market in
 * masked lines), then the check card: "Which side are you on?", the verdict for that side (remembered per market),
 * its evidence, then the details as glass rows: Pro money, the millionaire wallets, big bets of the last 24 hours, the
 * price now, the analyst line, Open and Share. Visitors get their free check whole (the verdict and the money), with
 * the wallets, the big bets and the analyst line locked: their content is never sent, the blur is drawn from nothing.
 * The verdict describes the data; it is never advice. Server component. */
import type { CSSProperties } from "react";
import { category as categoryInfo, categoryOf, categoryPhoto } from "@/lib/brand/categories";
import { outcomeNames, type MarketMoney, type Position } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { clockET, agoText } from "@/lib/moves/copy";
import { cents, pct, pricesFor, UNUSUAL_TEXT } from "@/lib/read/math";
import type { ReadData, SidePrices } from "@/lib/read/types";
import { ShareRead } from "@/components/read/ShareRead";
import { AskBox } from "../AskBox";
import { Arrow, Lines, m, Side, TierBadge } from "../Bits";
import { CheckCard } from "../CheckCard";
import { Stage } from "../Stage";

const row: CSSProperties = { display: "grid", gap: 10, paddingTop: 14, borderTop: "1px solid var(--glass-line)" };

function Locked({ what, href, testid }: { what: string; href: string; testid: string }) {
  return (
    <div style={row} data-testid={testid}>
      <span className="b-label">{what}</span>
      <div style={{ display: "grid", gap: 6 }} aria-hidden="true">
        {[0.9, 0.7, 0.8].map((w, i) => <span key={i} style={{ height: 12, width: `${w * 100}%`, borderRadius: 6, background: "rgba(255,255,255,.08)", filter: "blur(2px)" }} />)}
      </div>
      <a className="b-btn b-panel-pill" style={{ justifySelf: "start" }} href={href} data-checkout="read-members" data-locked="row">Start for $1 to see it<Arrow /></a>
    </div>
  );
}

function PriceRows({ data, us }: { data: ReadData; us: boolean }) {
  const p = pricesFor(data.prices, us);
  if (us && p.yes.kalshi === null && p.no.kalshi === null) {
    return <div style={row} data-testid="read-prices"><span className="b-label">Price now · Kalshi (US)</span><span className="b-small" data-testid="price-kalshi">Not on Kalshi. In the US we show Kalshi only.</span></div>;
  }
  // Each venue's price (the row header names them) or "not listed" (never a dash or 0¢); the better one marked outside the US.
  const cell = (s: SidePrices, v: "kalshi" | "polymarket") => {
    const p = s[v], name = v === "kalshi" ? "Kalshi" : "Polymarket";
    return p === null
      ? <span className="b-small" data-testid={`price-${v}`}>{us ? "Not listed" : `${name}: not listed`}</span>
      : <span className="b-num" data-testid={`price-${v}`} style={{ fontWeight: s.best === v && !us ? 600 : 500 }}>{cents(p)}{s.best === v && !us ? " · best" : ""}</span>;
  };
  return (
    <div style={row} data-testid="read-prices">
      <span className="b-label">Price now{us ? " · Kalshi (US)" : " · Kalshi / Polymarket"}</span>
      {([["yes", data.yesLabel], ["no", data.noLabel]] as const).map(([k, label]) => (
        <div key={k} className="b-kv"><span style={{ fontWeight: 500 }}>{label}</span><span style={{ display: "flex", gap: 14 }}>{cell(p[k], "kalshi")}{us ? null : cell(p[k], "polymarket")}</span></div>
      ))}
    </div>
  );
}

export function CheckPage({ id, data: raw, money, positions, member, us, now, startHref }: {
  id: string; data: ReadData; money: MarketMoney | null; positions: Position[]; member: boolean; us: boolean; now: number; startHref: string;
}) {
  // Both outcome names everywhere on the page: never "Yes"/"No" beside a team or player (outcomeNames).
  const data: ReadData = { ...raw, ...outcomeNames(raw.question, raw.yesLabel, raw.noLabel) };
  const cat = categoryOf({ title: data.question, event: data.event, url: data.polymarket?.url ?? null });
  const side = (s: "yes" | "no") => (s === "yes" ? data.yesLabel : data.noLabel);
  const mil = money?.millionaire ?? { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } };
  const pro = money?.pro ?? { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } };
  const top = (s: "yes" | "no") => positions.filter(p => p.tier === "millionaire" && p.side === s).sort((a, b) => b.dollars - a.dollars)[0]?.pnl ?? null;
  const prices = pricesFor(data.prices, us);
  const open = us ? (data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null)
    : (prices.yes.best === "kalshi" && data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : data.polymarket?.url ? { href: data.polymarket.url, venue: "Polymarket" } : data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null);
  const proSum = pro.yes.dollars + pro.no.dollars;

  return (
    <>
      <Stage bg={{ kind: "photo", photo: categoryPhoto(cat), priority: true, dark: 0.45 }} testid="read-head" labelledBy="read-q" className="b-stage--head">
        <div style={{ display: "grid", gap: 12, maxWidth: "min(100%, calc(900 * var(--u)))" }}>
          <span className="b-label" style={{ color: "var(--ink-muted)" }} {...m("quiet", 0.3)}>{categoryInfo(cat).name} · checked {clockET(data.at)}</span>
          <Lines as="h1" id="read-q" lines={[data.question]} size={56} />
          {data.event && data.event !== data.question ? <p className="b-sub" style={{ marginTop: 0 }} {...m("lift", 0.5)}>{data.event}</p> : null}
        </div>
      </Stage>
      <Stage testid="read-card" className="b-stage--body">
        <div className="b-col" style={{ maxWidth: "min(100%, calc(720 * var(--u)))" }} data-m="settle">
          <CheckCard marketKey={data.key} title={data.question} showTitle={false} emit={member ? undefined : "insidir:read-done"} testid="check-card"
            money={{ yes: mil.yes, no: mil.no, yesLabel: data.yesLabel, noLabel: data.noLabel, topPnl: { yes: top("yes"), no: top("no") } }}>
            <div style={row} data-testid="read-pro">
              <span className="b-label">Pro money · wallets with $100K+ all-time profit</span>
              {proSum ? (
                <div className="b-kv"><span>{([[pro.yes.dollars, data.yesLabel], [pro.no.dollars, data.noLabel]] as const).filter(([v]) => v > 0).map(([v, l]) => `${dollars(v)} on ${l}`).join(" · ")}</span><span className="b-small">{pro.yes.wallets + pro.no.wallets} wallets</span></div>
              ) : <span className="b-small">None yet</span>}
            </div>
            {member ? (
              <div style={row} data-testid="read-wallets">
                <span className="b-label">The wallets</span>
                {positions.length ? (
                  <ul className="b-wrows">{positions.slice(0, 8).map(p => (
                    <li key={`${p.wallet}:${p.side}`} className="b-wrow" data-testid="read-wallet"><TierBadge tier={p.tier} /><span><Side outcome={side(p.side)} side={p.side} /> <span className="b-small">{p.short}{p.pnl ? ` · up ${dollars(p.pnl)}` : ""}</span></span><span className="b-num" style={{ fontWeight: 600 }}>{dollars(p.dollars)}</span></li>
                  ))}</ul>
                ) : <span className="b-small">No watched wallet holds this market.</span>}
              </div>
            ) : positions.length ? <Locked what={`${positions.length} ${positions.length === 1 ? "wallet" : "wallets"}: each one's side, size and profit`} href={startHref} testid="read-wallets-locked" /> : null}
            {member ? (
              <div style={row} data-testid="read-bets">
                <span className="b-label">Big bets, last 24 hours</span>
                {data.bets.length ? data.bets.slice(0, 8).map((b, i) => (
                  <div key={i} className="b-kv" style={{ alignItems: "flex-start" }}>
                    <span><b className="b-num" style={{ fontWeight: 600 }}>{dollars(b.amount)}</b> on {side(b.side)} at {cents(b.price)}{b.unusual.length ? <span className="b-small"> · {b.unusual.map(u => u === "big_for_market" && b.ofVolume !== null ? `${pct(b.ofVolume)} of the day's volume` : UNUSUAL_TEXT[u]).join(", ")}</span> : null}</span>
                    <span className="b-small" style={{ whiteSpace: "nowrap" }}>{agoText(b.at, now)}</span>
                  </div>
                )) : <span className="b-small">No big bets in the last 24 hours.</span>}
              </div>
            ) : <Locked what={data.bets.length ? `${data.bets.length} big ${data.bets.length === 1 ? "bet" : "bets"} in the last 24 hours` : "Big bets, last 24 hours"} href={startHref} testid="read-locked" />}
            <PriceRows data={data} us={us} />
            {member ? (
              <div style={row} data-testid="read-line"><span className="b-label">Analyst line</span><p style={{ margin: 0, fontWeight: 300, fontSize: 16, lineHeight: 1.5 }}>{data.line?.text ?? "No line for this check."}</p></div>
            ) : <Locked what="The analyst line" href={startHref} testid="read-line-locked" />}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 6 }}>
              {open ? <a className="b-btn b-btn-lg b-primary" href={open.href} target="_blank" rel="noopener noreferrer" data-testid="read-open">Open on {open.venue}<Arrow /></a>
                : <span className="b-small" data-testid="read-open-none">{us ? "Not on Kalshi" : "No link"}</span>}
              <ShareRead id={id} className="b-btn b-btn-lg b-ghost">Share<Arrow /></ShareRead>
            </div>
          </CheckCard>
          <p className="b-small" data-testid="read-advice">Information, not financial or betting advice. Public data from Polymarket and Kalshi.</p>
        </div>
      </Stage>
      <Stage testid="read-again" className="b-stage--body" label="Check another bet">
        <div className="b-head"><Lines lines={["Check another bet."]} size={44} /></div>
        <AskBox />
      </Stage>
    </>
  );
}

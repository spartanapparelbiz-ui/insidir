/* One market's X-ray. Server-rendered from an Xray that has already been redacted for this viewer: when
 * `locked`, wallet-level fields are null here and are drawn as skeleton rows with the unlock button. */
import type { ReactNode } from "react";
import { ago, cents, day, money, pct, shares, shortAddress } from "@/lib/format";
import { METHOD } from "@/lib/method";
import type { InsiderFlag, ProvenWallet } from "@/lib/score";
import type { EventInfo } from "@/lib/types";
import type { Xray } from "@/lib/xray";

const oc = (i: number) => `o${Math.min(i, 2)}`;
const bg = (i: number) => `bg${Math.min(i, 2)}`;
const profile = (w: string) => `https://polymarket.com/profile/${encodeURIComponent(w)}`;

function Who({ wallet, name }: { wallet: string; name: string | null }) {
  return <a href={profile(wallet)} target="_blank" rel="noopener noreferrer">{name ?? shortAddress(wallet)}</a>;
}

function Locked({ rows, checkoutUrl, text }: { rows: number; checkoutUrl: string; text: string }) {
  return (
    <div className="locked">
      <div className="locked__rows" aria-hidden="true">
        {Array.from({ length: Math.max(1, Math.min(rows, 4)) }, (_, i) => (
          <span key={i} className="skel" style={{ width: `${88 - i * 14}%` }} />
        ))}
      </div>
      <p className="muted small">{text}</p>
      <div><a className="btn" href={checkoutUrl}>Unlock the full X-ray</a></div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="sec" aria-label={label}>
      <p className="sec__label">{label}</p>
      {children}
    </section>
  );
}

export function XrayView({ x, event, polymarketHref, checkoutUrl }: { x: Xray; event: EventInfo | null; polymarketHref: string; checkoutUrl: string }) {
  const m = x.market;
  const outcomes = m.outcomes;
  const eventTitle = event?.title ?? m.eventTitle;
  return (
    <div style={{ display: "grid", gap: 40 }}>
      {/* market header */}
      <header className="mh">
        {eventTitle && eventTitle !== m.question ? <p className="mh__event small">{eventTitle}</p> : null}
        <h1>{m.question}</h1>
        {m.resolvedOutcome ? <p><span className="resolved">Resolved: {m.resolvedOutcome}</span></p> : null}
        <p className="mh__odds">
          {outcomes.map((o, i) => <span key={o + i} className={oc(i)}>{o} {cents(m.prices[i] ?? 0)}</span>)}
        </p>
        <p className="mh__meta muted small">
          <span>{money(m.volume)} volume</span>
          {day(m.endDate) ? <span>{m.closed ? "Ended" : "Ends"} {day(m.endDate)}</span> : null}
          <a href={polymarketHref} target="_blank" rel="noopener noreferrer">Open on Polymarket</a>
        </p>
      </header>

      {x.failedWallets > 0 ? (
        <p className="note small">Partial data: {x.failedWallets} wallet{x.failedWallets === 1 ? "" : "s"} couldn&apos;t be checked.</p>
      ) : null}

      {/* sharp money: the hero */}
      <section className="hero" aria-label="Sharp money">
        <p className="sec__label">Sharp money</p>
        <h2 className={x.sharp.call && x.sharp.leaderIndex !== null ? oc(x.sharp.leaderIndex) : undefined}>{x.sharp.headline}</h2>
        {x.sharp.call ? (
          <>
            <div className="split" role="img" aria-label={outcomes.map((o, i) => `${o} ${pct(x.sharp.split[i] ?? 0)}`).join(", ")}>
              {x.sharp.split.map((s, i) => (s > 0 ? <i key={i} className={bg(i)} style={{ width: `${s * 100}%` }} /> : null))}
            </div>
            <p className="split__key small">
              {outcomes.map((o, i) => <span key={o + i} className={oc(i)}>{o} {pct(x.sharp.split[i] ?? 0)}</span>)}
            </p>
          </>
        ) : null}
        {x.sharp.detail ? <p className="muted">{x.sharp.detail}{x.sharp.byShares ? ", measured in shares because the market has resolved" : ""}</p> : null}
      </section>

      {/* insider patterns */}
      <Section label="Insider patterns">
        <h2 className={x.insider.level === "strong" ? "red" : undefined}>{x.insider.headline}</h2>
        {x.insider.count > 0 && x.insider.flags === null ? (
          <Locked rows={x.insider.count} checkoutUrl={checkoutUrl} text="The wallets, sizes and reasons are in the full X-ray." />
        ) : x.insider.flags && x.insider.flags.length ? (
          <div className="rows">{x.insider.flags.map(f => <FlagRow key={f.wallet + f.outcomeIndex} f={f} outcomes={outcomes} now={x.windowEnd} />)}</div>
        ) : x.insider.status === "ok" ? (
          <p className="muted small">Checked the {x.insider.walletsChecked} biggest buyers of {x.windowEnd === x.generatedAt ? "the last 7 days" : "its last 7 days"}.</p>
        ) : null}
      </Section>

      {/* last 24 hours */}
      <Section label={x.windowEnd === x.generatedAt ? "Last 24 hours" : "Its last 24 hours"}>
        <h2 className={x.flow.leaderIndex !== null ? oc(x.flow.leaderIndex) : undefined}>{x.flow.headline}</h2>
        {x.flow.net === null ? (
          x.flow.quiet ? null : <Locked rows={outcomes.length} checkoutUrl={checkoutUrl} text="The flow into each outcome is in the full X-ray." />
        ) : x.flow.status === "ok" ? (
          <FlowRows net={x.flow.net} outcomes={outcomes} />
        ) : null}
      </Section>

      {/* proven wallets */}
      <Section label="Proven wallets">
        {x.sharp.wallets === null ? (
          x.sharp.walletCount > 0
            ? <Locked rows={4} checkoutUrl={checkoutUrl} text="Names, positions and records are in the full X-ray." />
            : <p className="muted small">None of the top holders has a proven record yet.</p>
        ) : x.sharp.wallets.length ? (
          <WalletTable wallets={x.sharp.wallets} outcomes={outcomes} byShares={x.sharp.byShares} />
        ) : (
          <p className="muted small">
            {x.sharp.status === "ok" ? `Checked ${x.sharp.holdersChecked} top holders; none has a proven record yet.` : "Couldn't load the top holders."}
          </p>
        )}
      </Section>

      <Section label="Method">
        <div className="method">
          {METHOD.map(item => (
            <div key={item.title}><h3>{item.title}</h3><p>{item.text}</p></div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function FlagRow({ f, outcomes, now }: { f: InsiderFlag; outcomes: readonly string[]; now: number }) {
  return (
    <div className={`row flag--${f.level}`}>
      <div className="row__main">
        <p className="row__who">
          <span className="tag">{f.level === "strong" ? "Strong" : "Watch"}</span>
          <Who wallet={f.wallet} name={f.name} />
        </p>
        <ul className="reasons small">{f.reasons.map(r => <li key={r}>{r}</li>)}</ul>
      </div>
      <div className="row__right">
        <p><span className={oc(f.outcomeIndex)}>{outcomes[f.outcomeIndex] ?? "?"}</span> {money(f.cash)}</p>
        <p className="muted small">avg {cents(f.avgPrice)} · {ago(f.firstBuyAt, now)}</p>
      </div>
    </div>
  );
}

function FlowRows({ net, outcomes }: { net: number[]; outcomes: readonly string[] }) {
  const max = Math.max(1, ...net.map(v => Math.abs(v)));
  return (
    <div className="rows">
      {net.map((v, i) => (
        <div key={i} className="row">
          <div className="row__main">
            <p className={oc(i)}>{outcomes[i]}</p>
            <span className={`flowbar ${bg(i)}`} style={{ width: `${(Math.abs(v) / max) * 100}%`, opacity: v < 0 ? 0.35 : 1 }} aria-hidden="true" />
          </div>
          <p className="row__right">{v >= 0 ? "+" : ""}{money(v)} net</p>
        </div>
      ))}
    </div>
  );
}

function WalletTable({ wallets, outcomes, byShares }: { wallets: ProvenWallet[]; outcomes: readonly string[]; byShares: boolean }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr><th>Wallet</th><th>Side</th><th className="r">{byShares ? "Shares" : "Value"}</th><th className="r">W-L</th><th className="r">Win rate</th><th className="r">Profit</th></tr>
        </thead>
        <tbody>
          {wallets.map(w => (
            <tr key={w.wallet + w.outcomeIndex}>
              <td><Who wallet={w.wallet} name={w.name} /></td>
              <td className={oc(w.outcomeIndex)}>{outcomes[w.outcomeIndex] ?? "?"}</td>
              <td className="r">{byShares ? shares(w.value) : money(w.value)}</td>
              <td className="r">{w.record.wins}-{w.record.losses}</td>
              <td className="r">{w.record.winRate === null ? "—" : pct(w.record.winRate)}</td>
              <td className="r">{money(w.record.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

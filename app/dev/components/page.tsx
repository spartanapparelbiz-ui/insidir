/* The component gallery (docs/BRIEF.md §12.1): all 16 signature components in every state, on dark and on Paper.
 * Example data only (lib/dev-fixtures.ts), and the page says so. Off in production (app/dev/gallery.ts). */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DealTable } from "@/components/app/DealTable";
import { Devices } from "@/components/landing/Devices";
import { ProductLoop } from "@/components/landing/ProductLoop";
import { LedgerTable } from "@/components/receipts/LedgerTable";
import { DealCard } from "@/components/sig/DealCard";
import { Heartbeat } from "@/components/sig/Heartbeat";
import { KeptSlider } from "@/components/sig/KeptSlider";
import { MissedPanel } from "@/components/sig/MissedPanel";
import { PriceTicket } from "@/components/sig/PriceTicket";
import { SameRules } from "@/components/sig/SameRules";
import { StatBlock } from "@/components/sig/StatBlock";
import { UpgradeBar } from "@/components/sig/UpgradeBar";
import { Walkthrough } from "@/components/sig/Walkthrough";
import { DollarBar } from "@/components/ui/DollarBar";
import { CALC, CARD, CARD_CLOSED, CARD_FREE, CARD_STALE, KEPT, LEDGER, NOW, ROWS, WALK_LEGS } from "@/lib/dev-fixtures";
import { galleryOn } from "../gallery";
import { MovingWalkthrough, TickingNumber } from "./Demos";
import "../../landing.css";
import "../../receipts/receipts.css";
import "../../../components/app/terminal.css";
import "./gallery.css";

export const metadata: Metadata = { title: "Components", robots: { index: false, follow: false } };

function Item({ n, name, children, note }: { n: number; name: string; children: ReactNode; note?: string }) {
  return (
    <section className="gal__item" id={`c${n}`} aria-labelledby={`c${n}-h`}>
      <h2 id={`c${n}-h`} className="gal__h"><span className="mono">{n}</span> {name}</h2>
      {note ? <p className="gal__note">{note}</p> : null}
      {children}
    </section>
  );
}
function State({ label, children }: { label: string; children: ReactNode }) {
  return <div className="gal__state"><p className="gal__label">{label}</p>{children}</div>;
}

const BAR = [{ label: "YES on Kalshi", cents: 48 }, { label: "NO on Polymarket US", cents: 46 }];
const show = <a className="btn btn--primary" href="#c5">Show me how</a>;
const unlock = <a className="btn btn--primary" href="#c12">Try it for $1</a>;

export default function Gallery() {
  if (!galleryOn()) notFound();
  return (
    <main className="wrap gal">
      <header className="gal__top">
        <h1 className="gal__title">Components</h1>
        <p className="gal__warn">Example data. Every number on this page is made up to show the components; nothing here is a real deal.</p>
      </header>

      <Item n={1} name="The $1 bar" note="Hero (the 900ms sequence plays on load), card and inline; and prices over $1.">
        <State label="Hero, animated"><DollarBar legs={BAR} feesCents={1.4} size="hero" animate keepLabel="You keep $4.60 at $100" /></State>
        <State label="Card"><DollarBar legs={BAR} feesCents={1.4} size="card" /></State>
        <State label="Inline"><div style={{ maxWidth: 160 }}><DollarBar legs={BAR} feesCents={1.4} size="inline" /></div></State>
        <State label="Over $1: not a deal"><DollarBar legs={[{ label: "YES on Kalshi", cents: 55 }, { label: "NO on Polymarket US", cents: 46 }]} size="card" /></State>
      </Item>

      <Item n={2} name="Price ticket">
        <div className="gal__row">
          <State label="Live"><PriceTicket venue="Kalshi" side="yes" price="48¢" /></State>
          <State label="Stale"><PriceTicket venue="Polymarket US" side="no" price="46¢" state="stale" note="Last checked 40s ago" /></State>
          <State label="Paused"><PriceTicket venue="Kalshi" side="yes" price="48¢" state="paused" note="Last updated 6m ago" /></State>
        </div>
        <State label="A live tick: the changed digit rolls in with a violet glow"><TickingNumber /></State>
      </Item>

      <Item n={3} name="Deal card (Simple view)">
        <div className="gal__grid">
          <State label="Paid, live"><DealCard d={CARD} now={NOW} action={show} /></State>
          <State label="Free: values locked, not in the page"><DealCard d={CARD_FREE} now={NOW} action={unlock} /></State>
          <State label="Stale"><DealCard d={CARD_STALE} now={NOW} action={show} /></State>
          <State label="Closed"><DealCard d={CARD_CLOSED} now={NOW} action={null} /></State>
        </div>
      </Item>

      <Item n={4} name="Deal row (Pro view)" note="Paid, a Check row, and a free (locked, delayed) row.">
        <DealTable rows={ROWS} now={NOW} caption="Example deals" linkRows={false} />
        <State label="Compact (36px rows)"><DealTable rows={ROWS.slice(0, 2)} now={NOW} caption="Example deals, compact" compact linkRows={false} /></State>
      </Item>

      <Item n={5} name="Walkthrough">
        <div className="gal__grid">
          <State label="With the amount typed ($100)"><Walkthrough legs={WALK_LEGS} calc={CALC} closeTime={Date.UTC(2026, 10, 9)} /></State>
          <State label="A price moves: the step updates and says so"><MovingWalkthrough /></State>
          <State label="Free: what to buy, numbers locked"><Walkthrough legs={WALK_LEGS} calc={null} closeTime={Date.UTC(2026, 10, 9)} locked={unlock} /></State>
          <State label="A closed deal as a tutorial"><Walkthrough legs={WALK_LEGS} calc={CALC} closeTime={Date.UTC(2026, 10, 9)} closed /></State>
        </div>
      </Item>

      <Item n={6} name="Same rules? badge" note="Tap the first one: both rule texts side by side, differences marked.">
        <SameRules safety="green" rules={CARD.rules} />
        <div className="gal__row">
          <SameRules safety="green" /><SameRules safety="yellow" /><SameRules safety="red" />
          <SameRules safety="green" bare /><SameRules safety="yellow" bare /><SameRules safety="red" bare />
        </div>
      </Item>

      <Item n={7} name="Live heartbeat">
        <div className="gal__stack">
          <Heartbeat state="live" agoS={2} /><Heartbeat state="stale" agoS={34} /><Heartbeat state="paused" agoS={null} />
          <Heartbeat state="live" agoS={2} compact />
        </div>
      </Item>

      <Item n={8} name="Stat block" note="The third one is below its threshold, so it renders nothing.">
        <div className="gal__row">
          <StatBlock value={41203} text="41,203" line="markets scanned live" />
          <StatBlock value={12} text="12" line="deals today" />
          <StatBlock value={4} min={20} text="4.2 min" line="median deal life (needs 20 settled deals)" />
        </div>
      </Item>

      <Item n={9} name="What you could have kept">
        <KeptSlider points={KEPT} />
      </Item>

      <Item n={10} name="Missed deals (free)">
        <MissedPanel n={7} kept={141.2} action={unlock} />
      </Item>

      <div className="band--paper gal__band">
        <Item n={11} name="Ledger table (Receipts, on Paper)" note="A win, a loss shown with the same weight, and an open deal with members-only numbers.">
          <LedgerTable items={LEDGER} />
        </Item>
      </div>

      <Item n={12} name="Upgrade bar (free)">
        <UpgradeBar line={<>You&apos;re seeing deals 30 min late. <span className="mono">3</span> closed before you could see them today.</>} href="#c12" where="gallery" />
      </Item>

      <Item n={13} name="Toast" note="Real events only: one per 10s at most, 4 per visit, gone after 5s.">
        <div className="toast gal__toast"><p className="toast__text">New green deal just found: 4.9% on Will the Jets win on Nov 9?</p><button type="button" className="toast__x">Dismiss</button></div>
      </Item>

      <Item n={14} name="Device frames" note="They render the real components, not screenshots.">
        <Devices loop={false} phone={<div className="gal__phone"><DealCard d={CARD} now={NOW} action={show} /></div>}
          laptop={<DealTable rows={ROWS} now={NOW} caption="Example deals" linkRows={false} />} />
      </Item>

      <Item n={15} name="Reel"><ProductLoop /></Item>

      <Item n={16} name="Share card" note="Generated images of a closed receipt: OG (1200×630) and story (1080×1920).">
        <div className="gal__row gal__share">
          <img src="/dev/share?format=og" alt="Share card, OG size, example" width={600} height={315} />
          <img src="/dev/share?format=story" alt="Share card, story size, example" width={180} height={320} />
        </div>
      </Item>
    </main>
  );
}

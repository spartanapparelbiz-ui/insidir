/* The SEC research terminal (/sec; docs/INSIDIR-V3.md §0): what it is, its modules (each live or Coming soon by
 * lib/features.ts), the price and the start button (Whop checkout at /go, like every plan). The betting product stays up
 * alongside it for now (§7). Copy from lib/brand/sec-copy.ts. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Pill, Stage } from "@/components/system";
import { SecSoonBadge } from "@/components/sec/Badge";
import { getViewer } from "@/lib/auth/viewer";
import { SEC_LEAD, SEC_LEGAL, SEC_MODULES, SEC_PRICE, SEC_PROMISE, SEC_TITLE } from "@/lib/brand/sec-copy";
import { isReady } from "@/lib/features";
import { isPaid } from "@/lib/plans";
import "@/components/sec/sec.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: SEC_TITLE }, description: SEC_LEAD, alternates: { canonical: "/sec" } };

export default async function SecLanding() {
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const live = (f: Parameters<typeof isReady>[0]) => isReady(f);
  return (
    <Frame member={paid} current="board" testid="sec-landing">
      <Stage first testid="sec-hero" labelledBy="sec-h">
        <div className="b-head">
          <h1 id="sec-h" className="sec-h1" style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.1 }}>SEC research terminal</h1>
          <p className="b-sub">{SEC_LEAD}</p>
        </div>
        <ul className="sec-lists" data-testid="sec-modules" style={{ listStyle: "none", padding: 0, margin: "0 auto", maxWidth: 1080 }}>
          {SEC_MODULES.map(m => {
            const on = live(m.feature);
            return (
              <li key={m.name} className="sec-panel" data-module={m.name} data-live={on ? "1" : "0"}>
                <h2 className="sec-h2">{on && paid ? <a href={m.href}>{m.name}</a> : m.name} {on ? null : <SecSoonBadge />}</h2>
                <p className="sec-sub" style={{ fontSize: 14 }}>{m.line}{m.also && !live(m.also) ? " (the price chart is coming soon)" : ""}</p>
              </li>
            );
          })}
        </ul>
        <div className="b-center" style={{ marginTop: 28, textAlign: "center" }}>
          <p className="b-sub">{SEC_PROMISE}</p>
          <p className="b-sub" data-testid="sec-price"><strong>{SEC_PRICE}</strong></p>
          <div className="b-ctas">{paid ? <Pill href="/filings">Open SEC filings</Pill> : <Pill href="/go" data-checkout="sec" data-testid="sec-start">Start for $1</Pill>}</div>
          <p className="b-small" style={{ marginTop: 16 }}>{SEC_LEGAL}</p>
        </div>
      </Stage>
    </Frame>
  );
}

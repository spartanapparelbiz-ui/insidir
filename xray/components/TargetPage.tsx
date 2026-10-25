/* Renders whatever a link points at: one market's X-ray, an event's list of markets, or a plain message. */
import Link from "next/link";
import { checkoutUrl } from "@/lib/access";
import { cents, money } from "@/lib/format";
import { polymarketUrl, type Target } from "@/lib/link";
import { loadPage, titleFor } from "@/lib/page";
import type { Market } from "@/lib/types";
import { XrayView } from "./XrayView";

export async function TargetPage({ target }: { target: Target }) {
  const data = await loadPage(target);
  if (data.kind === "unavailable") {
    return (
      <div className="sec">
        <h1>Polymarket didn&apos;t answer.</h1>
        <p className="muted">Its public data could not be read just now. Try again in a minute.</p>
        <p><Link href="/">Paste another link</Link></p>
      </div>
    );
  }
  if (data.kind === "missing") {
    return (
      <div className="sec">
        <h1>No market found.</h1>
        <p className="muted">Nothing on Polymarket matches <code>{target.slug}</code>. Check the link and try again.</p>
        <p><Link href="/">Paste another link</Link></p>
      </div>
    );
  }
  if (data.kind === "list") return <MarketList slug={data.event.slug} title={data.event.title} markets={data.markets} />;
  const m = data.xray.market;
  const href = m.eventSlug ? polymarketUrl({ kind: "event", slug: m.eventSlug, market: m.eventSlug === m.slug ? null : m.slug }) : polymarketUrl({ kind: "market", slug: m.slug });
  return <XrayView x={data.xray} event={data.event} polymarketHref={href} checkoutUrl={checkoutUrl()} />;
}

const yesPrice = (m: Market): number => {
  const i = m.outcomes.findIndex(o => o.toLowerCase() === "yes");
  return m.prices[i >= 0 ? i : 0] ?? 0;
};

function MarketList({ slug, title, markets }: { slug: string; title: string; markets: Market[] }) {
  return (
    <div className="sec">
      <p className="sec__label">{markets.length} markets</p>
      <h1>{title}</h1>
      <p className="muted small">Pick one to X-ray. Sorted by volume.</p>
      <nav className="list" aria-label="Markets">
        {markets.map(m => (
          <Link key={m.slug} href={`/event/${encodeURIComponent(slug)}/${encodeURIComponent(m.slug)}`}>
            <span className="list__q">{m.groupItemTitle ?? m.question}{m.resolvedOutcome ? <span className="muted"> · Resolved: {m.resolvedOutcome}</span> : m.closed ? <span className="muted"> · Closed</span> : null}</span>
            <span className="o0">Yes {cents(yesPrice(m))}</span>
            <span className="muted">{money(m.volume)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** "X-ray: {market title}" for shared links. */
export async function targetMetadata(target: Target) {
  const title = await titleFor(target);
  const t = title ? `X-ray: ${title}` : "X-ray";
  const description = "Sharp money, insider patterns and the last 24 hours of flow for this Polymarket market. Data only, not advice.";
  return { title: { absolute: t }, description, openGraph: { title: t, description }, twitter: { card: "summary" as const, title: t, description } };
}

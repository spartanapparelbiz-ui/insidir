/* The fintech data stamp under every block of numbers: when they were read ("As of 9:41 PM ET"), where they come from
 * (each source a link), and how fresh they are for this viewer: a "30-min delay" tag for visitors, a live dot for
 * members. Server and client safe. */
import { clockET, dateTimeET } from "@/lib/moves/copy";

export interface Source { label: string; href: string }

export const SOURCES = {
  polymarket: { label: "Polymarket", href: "https://polymarket.com" },
  kalshi: { label: "Kalshi", href: "https://kalshi.com" },
  sec: { label: "SEC EDGAR", href: "https://www.sec.gov/edgar/search/" },
  methodology: { label: "How it's computed", href: "/methodology" },
} as const satisfies Record<string, Source>;

export function AsOf({ at, live, sources = [], className = "" }: { at: number; live: boolean; sources?: readonly Source[]; className?: string }) {
  return (
    <p className={`asof ${className}`} data-asof={at}>
      {live ? <span className="asof__live"><span className="asof__dot" aria-hidden="true" />Live</span> : <span className="asof__delay">30-min delay</span>}
      <span>As of <time dateTime={new Date(at).toISOString()} title={dateTimeET(at)}>{clockET(at)}</time></span>
      {sources.length ? (
        <span className="asof__src">Source: {sources.map((s, i) => (
          <span key={s.href}>{i ? ", " : ""}<a href={s.href} {...(s.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{s.label}</a></span>
        ))}</span>
      ) : null}
    </p>
  );
}

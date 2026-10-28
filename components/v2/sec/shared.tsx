/* Pieces the public SEC pages share (/insiders/[cik]-[slug], /insider-trading/[ticker], /funds/[cik]-[slug]): the page
 * frame, the trades table and the members-only line for older filings. Server components. Anyone sees the last 30 days
 * (lib/profiles/sec.ts FREE_DAYS); older rows are never sent to a free viewer's browser. */
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { LockButton } from "@/components/lock/Lock";
import type { Viewer } from "@/lib/auth/viewer";
import { insiderHref, personName, roleOf } from "@/lib/profiles/name";
import { FREE_DAYS } from "@/lib/profiles/sec";
import { calDate, exactDollars, signedPct } from "../profiles/shared";

export const perShare = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shareCount = (v: number) => Math.round(v).toLocaleString("en-US");
/** "CEO of Nvidia", "A director of Nvidia" (capitalised for a line of its own). */
export const roleLine = (role: string, company: string) => `${roleOf(role).replace(/^./, c => c.toUpperCase())} of ${company}`;

export function SecFrame({ viewer, current, children }: { viewer: Viewer; current: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={unlockHref()} current={current} />
      <main className="wrap app2 trader profile dark sec">{children}</main>
    </>
  );
}

/** "Showing the last 30 days." and, for older filings, the lock: the count only, never the rows. */
export function OlderLocked({ older, what }: { older: number; what: string }) {
  return (
    <aside className="upsell" data-locked="sec-history">
      <p className="upsell__text">
        {older ? `${older} older ${older === 1 ? what.replace(/s$/, "") : what} on file. ` : ""}Showing the last {FREE_DAYS} days. The full history and Follow are for members.
      </p>
      <LockButton where="sec-history" className="btn btn--primary">See the full history</LockButton>
    </aside>
  );
}

export interface TradeRowView {
  accession: string; code: "P" | "S"; ownerCik: string; ownerName: string; role: string; company: string; ticker: string | null;
  tradeDate: string | null; filedAt: Date; shares: number; price: number; value: number; url: string;
}

/** Every trade, newest first: the date, who (company pages) or which company (insider pages), bought or sold, shares,
 *  the price on the filing, the value, how the stock has done since (only with a close we hold) and the filing. */
export function TradesTable({ rows, show, since }: { rows: readonly TradeRowView[]; show: "insider" | "company"; since?: ReadonlyMap<string, number> }) {
  const withSince = Boolean(since?.size);
  return (
    <div className="ptable__wrap">
      <table className="ptable ptable--stack">
        <thead><tr>
          <th scope="col">Date</th><th scope="col">{show === "insider" ? "Insider" : "Company"}</th><th scope="col">Trade</th><th scope="col">Shares</th>
          <th scope="col">Price</th><th scope="col">Value</th>{withSince ? <th scope="col">Since</th> : null}<th scope="col"><span className="sr-only">Source</span></th>
        </tr></thead>
        <tbody>{rows.map(r => {
          const ch = since?.get(r.accession);
          return (
            <tr key={`${r.accession}:${r.ownerCik}:${r.code}`}>
              <td>{r.tradeDate ? calDate(r.tradeDate) : calDate(r.filedAt.toISOString().slice(0, 10))}</td>
              <th scope="row">{show === "insider"
                ? <><Link href={insiderHref(r.ownerCik, r.ownerName)}>{personName(r.ownerName)}</Link><span className="ptable__tick"> {roleOf(r.role)}</span></>
                : <>{r.company}{r.ticker ? <span className="ptable__tick"> {r.ticker}</span> : null}</>}</th>
              <td className={r.code === "P" ? "money" : undefined}>{r.code === "P" ? "Bought" : "Sold"}</td>
              <td data-label="Shares">{shareCount(r.shares)}</td>
              <td data-label="Price">{perShare(r.price)}</td>
              <td data-label="Value">{exactDollars(r.value)}</td>
              {withSince ? <td data-label="Since" className={ch === undefined ? undefined : ch >= 0 ? "money" : "loss"}>{ch === undefined ? "—" : signedPct(ch)}</td> : null}
              <td><a href={r.url} target="_blank" rel="noopener noreferrer">Filing</a></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

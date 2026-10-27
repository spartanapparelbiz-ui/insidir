/* An SEC filer's profile (/p/insider-<cik>): every open-market buy and sale on their Form 4s (lib/stocks/history.ts),
 * totals, and the price paid on each buy, each row linked to its filing. Price changes after a buy aren't shown: we
 * found no free daily price source licensed for display. */
import { notFound } from "next/navigation";
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { personName, roleOf } from "@/lib/profiles/name";
import { insiderTotals, tradesByFiling } from "@/lib/profiles/sec";
import { historyOf, insiderTradesFor } from "@/lib/profiles/store";
import { calDate, exactDollars, Locked } from "./shared";
import { profileSource } from "@/lib/moves/source";
import { SourceA } from "../MoveCard";
import { Photo } from "@/components/Photo";
import { BAND } from "@/lib/photos";
import Link from "next/link";

const perShare = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shares = (v: number) => Math.round(v).toLocaleString("en-US");

export async function InsiderProfile({ db, cik, viewer, trial }: { db: Db; cik: string; viewer: Viewer; trial: string }) {
  const paid = isPaid(viewer.plan);
  const [trades, hist] = await Promise.all([insiderTradesFor(db, cik).catch(() => []), historyOf(db, "owner", cik).catch(() => null)]);
  const latest = trades[0];
  if (!latest && !hist) notFound();
  const name = personName(latest?.ownerName ?? hist?.name ?? "An insider");
  const rows = tradesByFiling(trades);
  const t = insiderTotals(trades);
  const companies = [...new Set(trades.map(x => x.company))];
  return (
    <>
      <header className="trader__head">
        <Photo n={BAND.profile.stocks} className="trader__photo" wideOnly eager />
        <div>
          <p className="trader__kicker">{latest ? `${roleOf(latest.role).replace(/^./, c => c.toUpperCase())} of ${latest.company}` : "SEC filer"}</p>
          <h1 className="trader__name">{name}</h1>
          <SourceA link={profileSource({ kind: "insider", cik })} className="source source--dark" />
        </div>
      </header>
      <p className="note pnote">Form 4s are filed up to 2 business days after the trade. <Link href="/data">About our data</Link></p>
      {!paid ? <Locked trial={trial} what={`Their full record is for members: every open-market buy and sale they filed with the SEC${companies.length ? ` (${companies.slice(0, 3).join(", ")})` : ""}, with totals.`} />
        : (
          <>
            <dl className="record record--wide">
              <div><dt>Bought</dt><dd className="money">{exactDollars(t.bought)}</dd><span className="record__sub">{t.buys} {t.buys === 1 ? "filing" : "filings"}</span></div>
              <div><dt>Sold</dt><dd>{exactDollars(t.sold)}</dd><span className="record__sub">{t.sales} {t.sales === 1 ? "filing" : "filings"}</span></div>
            </dl>
            <p className="note psource">
              {hist?.completeSince ? `Every Form 4 they filed since ${calDate(hist.completeSince)}, open-market trades of stock only.`
                : hist ? `Still reading their SEC history (${hist.pending} filings to go). Open-market trades of stock only.`
                : "Open-market trades of stock from the Form 4s we've read."}
            </p>
            <section className="block" aria-labelledby="trades-h">
              <h2 id="trades-h" className="block__h">Every trade</h2>
              {rows.length ? (
                <div className="ptable__wrap">
                  <table className="ptable ptable--stack">
                    <thead><tr><th scope="col">Date</th><th scope="col">Company</th><th scope="col">Trade</th><th scope="col">Shares</th><th scope="col">Price paid</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Source</span></th></tr></thead>
                    <tbody>{rows.map(r => (
                      <tr key={`${r.accession}:${r.code}`}>
                        <td>{r.tradeDate ? calDate(r.tradeDate) : "—"}</td>
                        <th scope="row">{r.company}{r.ticker ? <span className="ptable__tick"> {r.ticker}</span> : null}</th>
                        <td className={r.code === "P" ? "money" : undefined}>{r.code === "P" ? "Bought" : "Sold"}</td>
                        <td data-label="Shares">{shares(r.shares)}</td>
                        <td data-label="Price paid">{perShare(r.price)}</td>
                        <td data-label="Value">{exactDollars(r.value)}</td>
                        <td><a href={r.url} target="_blank" rel="noopener noreferrer">Filing</a></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="note">No open-market buys or sales of stock on file yet.</p>}
            </section>
          </>
        )}
    </>
  );
}

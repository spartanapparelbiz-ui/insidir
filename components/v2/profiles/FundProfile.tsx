/* A fund's profile (/p/fund-<cik>): the top 10 holdings of its latest complete 13F-HR, its biggest adds and cuts per
 * quarter, and how many quarters EDGAR lists (lib/stocks/history.ts). Each section links to its filing. */
import { notFound } from "next/navigation";
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { quarterChanges, topHoldings, type Change } from "@/lib/profiles/sec";
import { fundOf, fundQuarters } from "@/lib/profiles/store";
import { calDate, exactDollars, Locked, pct } from "./shared";

const KIND: Record<Change["kind"], string> = { new: "New position", added: "Added", cut: "Cut", sold: "Sold all" };
const shares = (v: number) => Math.round(v).toLocaleString("en-US");

function Changes({ title, list }: { title: string; list: Change[] }) {
  if (!list.length) return null;
  return (
    <div>
      <h4 className="pq__h">{title}</h4>
      <ul className="positions">{list.map(c => (
        <li key={c.cusip} className="positions__row"><span className="positions__title">{c.company}</span><span className="positions__out">{KIND[c.kind]} · {shares(c.shares)} shares</span><span className="positions__val">{exactDollars(c.value)}</span></li>
      ))}</ul>
    </div>
  );
}

export async function FundProfile({ db, cik, viewer, trial }: { db: Db; cik: string; viewer: Viewer; trial: string }) {
  const paid = isPaid(viewer.plan);
  const fund = await fundOf(db, cik).catch(() => null);
  if (!fund) notFound();
  const quarters = paid ? await fundQuarters(db, cik).catch(() => []) : [];
  const latest = quarters[0];
  return (
    <>
      <header className="trader__head">
        <div>
          <p className="trader__kicker">Fund · files 13F reports with the SEC</p>
          <h1 className="trader__name">{fund.name}</h1>
        </div>
      </header>
      <p className="note">{fund.quartersOnFile} {fund.quartersOnFile === 1 ? "quarter" : "quarters"} on file with the SEC. 13F data can be up to 45 days old.</p>
      {!paid ? <Locked trial={trial} what="Their full record is for members: top 10 holdings and the biggest adds and cuts every quarter." />
        : latest ? (
          <>
            <section className="block" aria-labelledby="top-h">
              <h2 id="top-h" className="block__h">Top 10 holdings</h2>
              <p className="note">{latest.period ? `Quarter ending ${calDate(latest.period)}, filed` : "Filed"} {calDate(latest.filedOn)}. <a href={latest.url} target="_blank" rel="noopener noreferrer">See the SEC filing</a></p>
              <ol className="positions">{topHoldings(latest.holdings).map(h => (
                <li key={h.cusip} className="positions__row"><span className="positions__title">{h.company}</span><span className="positions__out">{pct(h.share)} of reported</span><span className="positions__val">{exactDollars(h.value)}</span></li>
              ))}</ol>
            </section>
            <section className="block" aria-labelledby="q-h">
              <h2 id="q-h" className="block__h">Biggest adds and cuts</h2>
              {quarters.length < 2 ? <p className="note">We compare quarters once we hold two of their filings.</p> : null}
              {quarters.slice(0, -1).map((q, i) => {
                const { adds, cuts } = quarterChanges(quarters[i + 1]!.holdings, q.holdings);
                return (
                  <article key={q.accession} className="pq">
                    <h3 className="pq__title">{q.period ? `Quarter ending ${calDate(q.period)}` : `Filed ${calDate(q.filedOn)}`}</h3>
                    <p className="note">Versus the quarter before. Filed {calDate(q.filedOn)}. <a href={q.url} target="_blank" rel="noopener noreferrer">See the SEC filing</a></p>
                    <div className="pq__grid"><Changes title="Biggest adds" list={adds} /><Changes title="Biggest cuts" list={cuts} /></div>
                  </article>
                );
              })}
            </section>
          </>
        ) : <p className="note">Not enough history yet. We show holdings once we&apos;ve read one of their filings in full.</p>}
    </>
  );
}

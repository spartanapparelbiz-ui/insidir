/* Research's answer: 1–2 sentences, then the rows as Insidir tables (artwork, links, figures aligned), each with its
 * data stamp (as of, source, 30-min delay or live). Server and client safe. */
import { AsOf } from "@/components/data/AsOf";
import { MoveArt } from "@/components/MoveArt";
import type { Answer } from "@/lib/research/run";

export function ResearchAnswer({ a, csvHref }: { a: Answer; csvHref?: string | null }) {
  return (
    <div className="rans" data-testid="research-answer">
      <p className="rans__text">{a.text}</p>
      {a.tables.map((t, i) => (
        <section key={`${t.tool}-${i}`} className="rans__table">
          <h3 className="rans__h">{t.title}</h3>
          {t.rows.length ? (
            <div className="rans__scroll">
              <table className="rtable">
                <thead><tr>{t.columns.map((c, j) => <th key={c} scope="col" className={t.numeric.includes(j) ? "num" : undefined}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, k) => (
                  <tr key={k}>{r.map((c, j) => {
                    const body = <>{c.art ? <MoveArt art={c.art} className="art-mini rtable__art" /> : null}<span>{c.text}</span></>;
                    return <td key={j} className={`${t.numeric.includes(j) ? "num" : ""}${c.tone ? ` ${c.tone}` : ""}`.trim() || undefined}>{c.href ? <a href={c.href} className="rtable__a">{body}</a> : <span className="rtable__a">{body}</span>}</td>;
                  })}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rans__empty">No rows.</p>}
          {t.note ? <p className="rans__note">{t.note}</p> : null}
          <AsOf at={t.at} live={t.live} sources={t.sources} />
        </section>
      ))}
      {csvHref && a.tables.some(t => t.rows.length) ? <p className="rans__csv"><a href={csvHref} data-testid="research-csv">Export CSV</a></p> : null}
    </div>
  );
}

/* The user's own P&L totals and markets. Numbers only: no suggestions, no links out. No hooks (server or client). */
import type { PnlSummary } from "@/lib/pnl";

const money = (v: number): string => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v: number) => <span className={v > 0 ? "profit" : v < 0 ? "loss" : undefined}>{money(v)}</span>;

export function PnlTable({ summary, label }: { summary: PnlSummary; label: string }) {
  const valued = summary.openValue !== null;
  return (
    <section className="pnl" aria-label={label}>
      <dl className="kv kv--big">
        <div><dt>Realized P&amp;L</dt><dd>{signed(summary.realized)}</dd></div>
        <div><dt>{valued ? "Open positions value" : "Open positions cost"}</dt><dd>{money(valued ? (summary.openValue ?? 0) : summary.openCost)}</dd></div>
        <div><dt>Open positions</dt><dd>{summary.openPositions}</dd></div>
      </dl>
      {!valued && summary.openPositions ? <p className="dim small">The file has no current prices, so open positions show what they cost.</p> : null}
      {summary.truncated ? <p className="dim small">Only the most recent {summary.rows.toLocaleString("en-US")} history rows were read, so older trades are not counted.</p> : null}
      {summary.markets.length ? (
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Market</th><th className="r">Held</th><th className="r">Realized</th><th className="r">Open cost</th>{valued ? <th className="r">Open value</th> : null}</tr></thead>
            <tbody>
              {summary.markets.map(m => (
                <tr key={m.key}>
                  <td>{m.title}{m.outcome ? <span className="dim tiny calc__lbl">{m.outcome}</span> : null}</td>
                  <td className="r">{m.openContracts > 0 ? Math.round(m.openContracts * 100) / 100 : "—"}</td>
                  <td className="r">{signed(m.realized)}</td>
                  <td className="r">{m.openContracts > 0 ? money(m.openCost) : "—"}</td>
                  {valued ? <td className="r">{m.openContracts > 0 && m.openValue !== null ? money(m.openValue) : "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small">No positions or history found.</p>}
      <p className="dim tiny">{summary.rows.toLocaleString("en-US")} history rows read{summary.skipped ? `, ${summary.skipped} skipped` : ""}.</p>
    </section>
  );
}

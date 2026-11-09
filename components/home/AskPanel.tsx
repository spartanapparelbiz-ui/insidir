"use client";
/* Ask Insidir on the member home: a compact command-style box that posts to /api/ask (lib/ask/run.ts: answers only from
 * Insidir's tables, the rows behind each answer shown as tables, "I don't have that." when the data doesn't have it),
 * with three example questions as one-tap keys. The same answer as /ask, set as a terminal panel. */
import { useState, type FormEvent } from "react";

interface Cell { text: string; href?: string; tone?: "pos" | "neg" }
interface Table { tool: string; title: string; columns: string[]; numeric: number[]; rows: Cell[][]; note?: string | null }
interface Answer { question: string; text: string; tables: Table[] }

export function AskPanel({ examples }: { examples: readonly string[] }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) as { answer?: Answer; error?: string } | null : null;
    setBusy(false);
    if (!res || !res.ok || !body?.answer) { setError(body?.error ?? "That didn't work. Try again in a moment."); return; }
    setAnswer(body.answer);
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return (
    <div className="t-ask" data-testid="home-ask-box">
      <form className="t-cmd t-ask__form" onSubmit={submit}>
        <span className="t-ask__prompt" aria-hidden="true">ASK&gt;</span>
        <label className="b-sr" htmlFor="home-ask-q">Ask about the wallets, a market or your bet</label>
        <input id="home-ask-q" value={q} onChange={e => setQ(e.target.value)} maxLength={300} placeholder="Ask about the wallets, a market or your bet" autoComplete="off" data-testid="home-ask-input" />
        <button type="submit" className="t-go" disabled={busy} data-testid="home-ask-submit">{busy ? "…" : "<GO>"}</button>
      </form>
      <div className="t-ask__try">
        {examples.map(x => <button key={x} type="button" className="t-btn2" onClick={() => { setQ(x); void ask(x); }} data-testid="home-ask-example">{x}</button>)}
      </div>
      {busy ? <p className="t-muted t-small" role="status">Looking it up in Insidir&apos;s data…</p> : null}
      {error ? <p className="t-down t-small" role="alert" data-testid="home-ask-error">{error}</p> : null}
      {answer && !busy ? (
        <div className="t-ask__answer" aria-live="polite" data-testid="home-ask-answer">
          <p className="t-ask__q t-muted">Q: {answer.question}</p>
          <p className="t-ask__text" data-testid="home-ask-text">{answer.text}</p>
          {answer.tables.map((t, i) => (
            <div key={i} className="t-scroll">
              <p className="t-label">{t.title}</p>
              <table className="t-table t-table--compact">
                <thead><tr>{t.columns.map(c => <th key={c} className={t.numeric.includes(t.columns.indexOf(c)) ? "r" : undefined}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={`${t.numeric.includes(k) ? "r" : ""}${c.tone === "pos" ? " t-up" : c.tone === "neg" ? " t-down" : ""}`}>{c.href ? <a href={c.href}>{c.text}</a> : c.text}</td>)}</tr>)}</tbody>
              </table>
              {t.note ? <p className="t-muted t-small">{t.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

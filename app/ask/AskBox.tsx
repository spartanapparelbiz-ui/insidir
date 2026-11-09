"use client";
/* The Ask Insidir box, on the terminal: a question in, the ANSWER panel out: a short answer and the rows behind it
 * (lib/ask/run.ts), with a SOURCE footer ("SOURCE: INSIDIR DATA · ANSWERED 10:31 PM ET"). `initial` (the page's ?q=,
 * from the top bar's command line) is filled in and asked once on load: one request, the same limits and logging as a
 * typed question. */
import { useEffect, useRef, useState, type FormEvent } from "react";

interface Cell { text: string; href?: string; tone?: "pos" | "neg" }
interface Table { tool: string; title: string; columns: string[]; numeric: number[]; rows: Cell[][]; note?: string | null }
interface Answer { question: string; text: string; tables: Table[]; at?: number }

const ANSWERED = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
/** "SOURCE: INSIDIR DATA · ANSWERED 10:31 PM ET". Pure. */
export const answeredLine = (ms: number): string => `SOURCE: INSIDIR DATA · ANSWERED ${ANSWERED.format(new Date(ms)).toUpperCase()} ET`;

export function AskBox({ examples, member, initial = "" }: { examples: readonly string[]; member: boolean; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const asked = useRef(false);

  async function ask(question: string) {
    if (question.trim().length < 3 || busy) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) as { answer?: Answer; error?: string; remaining?: number | null } | null : null;
    setBusy(false);
    if (!res || !res.ok || !body?.answer) { setError(body?.error ?? "That didn't work. Try again in a moment."); return; }
    setAnswer(body.answer); setLeft(body.remaining ?? null); setAnsweredAt(typeof body.answer.at === "number" ? body.answer.at : Date.now());
  }
  // ?q= from the command line: asked once, on load.
  useEffect(() => {
    if (asked.current || initial.trim().length < 3) return;
    asked.current = true;
    void ask(initial.trim());
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return (
    <div data-testid="ask-box">
      <form className="ask-form" onSubmit={submit} role="search">
        <input className="ask-input" name="q" value={q} onChange={e => setQ(e.target.value)} maxLength={300} placeholder="Ask about the wallets, a market or your bet" aria-label="Your question" data-testid="ask-input" />
        <button type="submit" className="ask-go" disabled={busy} data-testid="ask-submit">{busy ? "ASKING…" : "ASK <GO>"}</button>
      </form>
      <div className="ask-try" aria-label="Examples">
        {examples.map(x => <button key={x} type="button" onClick={() => { setQ(x); void ask(x); }}>{x}</button>)}
      </div>
      {error ? <p className="tg-msg tg-msg--error" role="alert" data-testid="ask-error" style={{ marginTop: 12 }}>{error}</p> : null}
      {busy && !answer ? <p className="ask-busy" role="status">Reading Insidir&apos;s data…</p> : null}
      {answer ? (
        <section className="ask-answer" data-testid="ask-answer" aria-live="polite" aria-label="Answer">
          <header className="ask-answer__head"><h2 className="ask-answer__title"><span className="t-panel__n">A)</span>ANSWER</h2><span className="ask-answer__q">{answer.question}</span></header>
          <div className="ask-answer__body">
            <p className="ask-text" data-testid="ask-text">{answer.text}</p>
            {answer.tables.map((t, i) => (
              <div key={i} className="ask-scroll">
                <p className="t-label ask-table-title">{t.title}</p>
                <table className="t-table" data-testid="ask-table">
                  <thead><tr>{t.columns.map((c, k) => <th key={c} scope="col" className={t.numeric.includes(k) ? "r" : undefined}>{c}</th>)}</tr></thead>
                  <tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={[t.numeric.includes(k) ? "r" : "", c.tone === "pos" ? "t-up" : c.tone === "neg" ? "t-down" : ""].filter(Boolean).join(" ") || undefined}>{c.href ? <a href={c.href}>{c.text}</a> : c.text}</td>)}</tr>)}</tbody>
                </table>
                {t.note ? <p className="tg-note">{t.note}</p> : null}
              </div>
            ))}
            {!member && left !== null ? <p className="tg-note">{left} free {left === 1 ? "question" : "questions"} left today. <a href="/go">Members ask as many as they like.</a></p> : null}
          </div>
          <footer className="ask-src" data-testid="ask-source">{answeredLine(answeredAt ?? Date.now())}</footer>
        </section>
      ) : null}
    </div>
  );
}

type Props = { searchParams: Promise<{ error?: string; u?: string; unlock?: string }> };

export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  return (
    <div className="home">
      <h1>See who is behind a Polymarket market.</h1>
      <p className="muted">Where wallets with proven records are positioned, big buys from brand-new wallets, and the last 24 hours of money flow. Data only.</p>
      <form className="paste" action="/go" method="get" role="search">
        <label className="sr-only" htmlFor="u">Polymarket link</label>
        <input id="u" name="u" type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Paste a Polymarket link" defaultValue={q.u ?? ""} required />
        <button className="btn" type="submit">X-ray it</button>
      </form>
      {q.error ? <p className="err small">That doesn&apos;t look like a Polymarket market link. Paste the full address from your browser.</p> : null}
      {q.unlock === "failed" ? <p className="err small">That unlock link didn&apos;t work.</p> : null}
      <div className="tip small">
        <p><span className="muted">Tip: on any Polymarket page, swap the domain.</span></p>
        <p><code>polymarket.com</code><span className="muted">/event/…</span> → <code>insidir.com</code><span className="muted">/event/…</span></p>
      </div>
    </div>
  );
}

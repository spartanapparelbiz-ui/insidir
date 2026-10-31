/* Research (/research): ask a plain-English question over Insidir's data and get 1–2 sentences and the rows as
 * tables, with sources and "as of" times (lib/research). Works without JavaScript (a GET form); the same opens from the header
 * anywhere (and Cmd/Ctrl+K, silently). Visitors: 3 questions a day on data 30 minutes late; members: live, with Export CSV. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { ResearchAnswer } from "@/components/research/ResearchTables";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { movePlan } from "@/lib/moves/gate";
import { isPaid } from "@/lib/plans";
import { ask, VISITOR_DAILY } from "@/lib/research/ask";
import { suggestionsFor } from "@/lib/research/suggest";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Research", description: "Ask plain-English questions over Insidir's data: large positions, trackers, account records and SEC filings, answered with the rows themselves." };

const EXAMPLES = [
  ...suggestionsFor("/"),
  "This account's record on soccer totals",
  "Markets with the most large-position money this month",
  "Director purchases in the last 30 days",
];

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [viewer, jar, sp] = await Promise.all([getViewer(), cookies(), searchParams]);
  const q = (sp.q ?? "").trim().slice(0, 300);
  const member = isPaid(viewer.plan);
  const now = Date.now(), delay = movePlan(viewer.plan).delayMs;
  const r = q.length >= 3 && hasDatabase()
    ? await ask(getDb(), { question: q, userId: viewer.user?.id ?? null, visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, member, live: delay === 0, until: now - delay, now }).catch(() => null)
    : null;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/research" trialHref={unlockHref()} tone="light" />
      <main className="wrap research">
        <h1 className="research__h">Research</h1>
        <p className="research__sub">Ask about large positions, trackers, account records and SEC filings. The answer is the rows themselves, with their sources. Insidir describes data; it doesn&apos;t give advice.</p>
        <form className="research__form" action="/research" method="get" role="search">
          <label className="sr-only" htmlFor="research-q">Your question</label>
          <input id="research-q" name="q" className="input research__input" defaultValue={q} placeholder={EXAMPLES[0]} maxLength={300} autoComplete="off" />
          <button type="submit" className="btn btn--primary">Ask</button>
        </form>
        {r?.ok ? <ResearchAnswer a={r.answer} csvHref={member ? `/api/research/csv?id=${r.id}` : null} />
          : r && !r.ok ? <p className="research__limit" role="alert" data-testid="research-limit">Visitors get {VISITOR_DAILY} questions a day. Members ask as many as they like, on live data. <a href={unlockHref()}>Try 7 days for $1</a></p>
            : q ? <p className="research__limit" role="alert">Research is catching up. Try again in a minute.</p> : null}
        {!member ? <p className="research__fine">{VISITOR_DAILY} questions a day for visitors, on data 30 minutes late. Members: live data, as many as they like, Export CSV.</p> : null}
        <h2 className="research__h2">Try</h2>
        <ul className="research__tips">{EXAMPLES.map(e => <li key={e}><a href={`/research?q=${encodeURIComponent(e)}`}>{e}</a></li>)}</ul>
      </main>
    </>
  );
}

/* Status (/status): is Insidir working right now? Each source's freshness, each worker job's last heartbeat, the
 * hourly accuracy checks, and this web server's uptime and deploy, all from real checks (lib/status-page.ts). Green
 * means working, amber behind, red failing. Incidents are the failures those checks recorded in the last 7 days. */
import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { getDb, hasDatabase } from "@/lib/db";
import { clockET, dateTimeET } from "@/lib/moves/copy";
import { ago, readStatus, STARTED_AT, type Light, type Status } from "@/lib/status-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status", description: "Live status of every Insidir data source, the worker jobs, the hourly accuracy checks and the web app." };

const WORD: Record<Light, string> = { green: "Working", amber: "Behind", red: "Failing" };
const Dot = ({ l }: { l: Light }) => <span className={`stat__dot stat__dot--${l}`} aria-hidden="true" />;

export default async function StatusPage() {
  const now = Date.now();
  const s: Status | null = hasDatabase() ? await readStatus(getDb(), now).catch(() => null) : null;
  const incidents = s ? [
    ...s.jobs.filter(j => j.light === "red").map(j => ({ at: j.lastRunAt, text: `${j.label}: ${j.error ?? "last run failed"}` })),
    ...s.checks.filter(c => c.mismatch > 0).map(c => ({ at: c.runAt, text: `Accuracy check: ${c.mismatch} of ${c.checked} didn't match the source and were hidden until they do` })),
  ].sort((a, b) => b.at - a.at) : [];
  const overall = s?.overall ?? "red";
  return (
    <TrustPage path="/status" title="Status" cta={false}
      lead={s ? <><span className="stat__head"><Dot l={overall} />{overall === "green" ? "All systems working." : overall === "amber" ? "Some data is behind." : "Something is failing."}</span> As of {clockET(now)}.</> : "Status can't be read right now: the database isn't reachable from this page."}>
      {s ? <>
        <h2>Sources</h2>
        <ul className="stat__list" data-testid="status-sources">
          {s.sources.map(x => <li key={x.key} className="stat__row"><Dot l={x.light} /><span className="stat__name">{x.label}</span><span className="stat__note">{x.note}</span><span className="stat__word">{WORD[x.light]}</span></li>)}
        </ul>
        <p className="stat__fine">Sources: each job's own last successful read of Polymarket, Kalshi and SEC EDGAR. 13F filings arrive quarterly, so a quiet week there is normal and doesn&apos;t change the overall status.</p>

        <h2>Worker jobs</h2>
        {s.jobs.length ? (
          <ul className="stat__list" data-testid="status-jobs">
            {s.jobs.map(j => <li key={j.job} className="stat__row"><Dot l={j.light} /><span className="stat__name">{j.label}</span>
              <span className="stat__note">{j.ok ? `Last run ${ago(j.lastRunAt, now)}` : `Failed ${ago(j.lastRunAt, now)}${j.lastOkAt ? `, last worked ${ago(j.lastOkAt, now)}` : ""}`}</span><span className="stat__word">{WORD[j.light]}</span></li>)}
          </ul>
        ) : <p>No worker heartbeats recorded yet.</p>}

        <h2>Accuracy checks</h2>
        {s.checks.length ? (
          <ul className="stat__list" data-testid="status-checks">
            {s.checks.slice(0, 12).map(c => <li key={c.runAt} className="stat__row"><Dot l={c.mismatch ? "amber" : "green"} /><span className="stat__name">{dateTimeET(c.runAt)}</span><span className="stat__note">{c.ok} of {c.checked} matched the source</span><span className="stat__word">{c.mismatch ? `${c.mismatch} hidden` : "All matched"}</span></li>)}
          </ul>
        ) : <p>No accuracy checks in the last 7 days.</p>}

        <h2>Web app</h2>
        <ul className="stat__list">
          <li className="stat__row"><Dot l="green" /><span className="stat__name">insidir.com</span><span className="stat__note">Up since {dateTimeET(STARTED_AT)} ({ago(STARTED_AT, now).replace(" ago", "")})</span><span className="stat__word">Working</span></li>
          <li className="stat__row"><span className="stat__dot" aria-hidden="true" /><span className="stat__name">Last deploy</span><span className="stat__note">{s.web.commit ? `Commit ${s.web.commit}, started ${dateTimeET(s.web.startedAt)}` : `Started ${dateTimeET(s.web.startedAt)}`}</span><span className="stat__word" /></li>
        </ul>

        <h2>Incidents, last 7 days</h2>
        {incidents.length ? (
          <ul className="stat__list" data-testid="status-incidents">{incidents.slice(0, 20).map(i => <li key={`${i.at}${i.text}`} className="stat__row"><span className="stat__name">{dateTimeET(i.at)}</span><span className="stat__note">{i.text}</span></li>)}</ul>
        ) : <p data-testid="status-incidents">None recorded.</p>}
      </> : null}
      <p>Something wrong that this page doesn&apos;t show? Write to <a href="mailto:hello@aethric.llc">hello@aethric.llc</a>.</p>
    </TrustPage>
  );
}

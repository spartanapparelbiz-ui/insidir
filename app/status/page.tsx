/* Status (/status): is Insidir working right now? Each source's freshness, each worker job's last heartbeat, the
 * hourly accuracy audits, freshness of trades, twins and prices (stale over 5 minutes), the production checks (every 15
 * minutes: landing → a market → checkout → Whop sign-in → a member's Today → search → a fixture Autopilot match → an exit ping), and this
 * web server's uptime and deploy, all from real checks (lib/status-page.ts). Green
 * means working, amber behind, red failing. Incidents are the failures those checks recorded in the last 7 days. */
import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { getDb, hasDatabase } from "@/lib/db";
import { clockET, dateTimeET } from "@/lib/moves/copy";
import { ago, readStatus, STARTED_AT, type Light, type Status } from "@/lib/status-page";
import { monitorView, type MonitorView } from "@/lib/monitor/money-path";
import { freshness, type Freshness } from "@/lib/monitor/product";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status", description: "Live status of every Insidir data source, the worker jobs, the hourly accuracy audits and the web app." };

const WORD: Record<Light, string> = { green: "Working", amber: "Behind", red: "Failing" };
const Dot = ({ l }: { l: Light }) => <span className={`stat__dot stat__dot--${l}`} aria-hidden="true" />;

export default async function StatusPage() {
  const now = Date.now();
  const s: Status | null = hasDatabase() ? await readStatus(getDb(), now).catch(() => null) : null;
  const mp: MonitorView | null = hasDatabase() ? await monitorView(getDb(), now).catch(() => null) : null;
  const fr: Freshness[] | null = hasDatabase() ? await freshness(getDb(), now).catch(() => null) : null;
  const incidents = s ? [
    ...s.jobs.filter(j => j.light === "red").map(j => ({ at: j.lastRunAt, text: `${j.label}: ${j.error ?? "last run failed"}` })),
    ...(mp?.failures24h ?? []).map(f => ({ at: f.at, text: `Live test failed at ${f.step ?? "a step"}: ${f.detail ?? "no detail"}` })),
    ...s.checks.filter(c => c.mismatch > 0).map(c => ({ at: c.runAt, text: `Accuracy audit: ${c.mismatch} of ${c.checked} didn't match the source and were hidden until they do` })),
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
        <p className="stat__fine">Sources: each job's own last successful read of Polymarket and Kalshi.</p>

        <h2>Freshness</h2>
        {fr ? (
          <ul className="stat__list" data-testid="status-freshness">
            {fr.map(x => <li key={x.key} className="stat__row" data-stale={x.stale ? "1" : "0"}><Dot l={x.stale ? "red" : "green"} /><span className="stat__name">{x.label}</span>
              <span className="stat__note">{x.at === null ? "Never read" : `Read ${ago(x.at, now)}`}</span><span className="stat__word">{x.stale ? "Stale" : "Fresh"}</span></li>)}
          </ul>
        ) : null}
        <p className="stat__fine">Stale means not read in the last 5 minutes. The owners get a push when anything is.</p>

        <h2>Live tests</h2>
        <div data-testid="status-money-path">
          {mp?.last ? (
            <ul className="stat__list">
              <li className="stat__row"><Dot l={mp.last.ok ? "green" : "red"} /><span className="stat__name">Landing → a market → checkout → sign-in → Today → search → Autopilot → exit signal → freshness</span>
                <span className="stat__note">{mp.last.ok ? `Every step passed ${ago(mp.last.at, now)} (${mp.last.ms} ms)` : `Failed ${ago(mp.last.at, now)} at ${mp.last.failedStep}: ${mp.last.detail ?? ""}`}</span><span className="stat__word">{mp.last.ok ? "Working" : "Failing"}</span></li>
              {mp.last.steps.map(st => <li key={st.step} className="stat__row"><Dot l={st.ok ? "green" : "red"} /><span className="stat__name">{st.step}</span><span className="stat__note">{st.ok ? `${st.ms} ms` : st.detail}</span><span className="stat__word" /></li>)}
            </ul>
          ) : <p>The live tests haven&apos;t run yet.</p>}
          {mp ? <p className="stat__fine">Checked every 15 minutes: {mp.runs24h} runs in the last 24 hours, {mp.failures24h.length} failed. A failure is sent as a push alert to the owners&apos; devices.</p> : null}
        </div>

        <h2>Worker jobs</h2>
        {s.jobs.length ? (
          <ul className="stat__list" data-testid="status-jobs">
            {s.jobs.map(j => <li key={j.job} className="stat__row"><Dot l={j.light} /><span className="stat__name">{j.label}</span>
              <span className="stat__note">{j.ok ? `Last run ${ago(j.lastRunAt, now)}` : `Failed ${ago(j.lastRunAt, now)}${j.lastOkAt ? `, last worked ${ago(j.lastOkAt, now)}` : ""}`}</span><span className="stat__word">{WORD[j.light]}</span></li>)}
          </ul>
        ) : <p>No worker heartbeats recorded yet.</p>}
        <p className="stat__fine" data-testid="status-sec">
          SEC filings: {s.sec.since ? `every Form 3, 4 and 5 filed from ${s.sec.since} on has been read` : "the backfill of insider filings is still reading recent days"}.
          {" "}{s.sec.alerts ? `Watchlist signals in the last day: ${s.sec.alerts}, the median made ${s.sec.p50s}s after the filing reached EDGAR, 95% within ${s.sec.p95s}s.` : "No watchlist signals in the last day."}
        </p>
        {s.backfill ? (
          <p className="stat__fine" data-testid="status-backfill">
            Proven-wallet backfill, last run {ago(s.backfill.at, now)}: {s.backfill.wallets.toLocaleString("en-US")} wallets, {s.backfill.requests.toLocaleString("en-US")} requests at {s.backfill.reqPerSec}/s
            (Data API limit {s.backfill.limitPerSec}/s, using up to {Math.round(s.backfill.share * 100)}%), {s.backfill.rateLimited ? `${s.backfill.rateLimited} rate-limited` : "no rate limiting"}.
            {" "}{s.backfill.queued.toLocaleString("en-US")} queued, {s.backfill.due.toLocaleString("en-US")} due.
          </p>
        ) : null}

        <h2>Accuracy audits</h2>
        {s.checks.length ? (
          <ul className="stat__list" data-testid="status-checks">
            {s.checks.slice(0, 12).map(c => <li key={c.runAt} className="stat__row"><Dot l={c.mismatch ? "amber" : "green"} /><span className="stat__name">{dateTimeET(c.runAt)}</span><span className="stat__note">{c.ok} of {c.checked} matched the source</span><span className="stat__word">{c.mismatch ? `${c.mismatch} hidden` : "All matched"}</span></li>)}
          </ul>
        ) : <p>No accuracy audits in the last 7 days.</p>}

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

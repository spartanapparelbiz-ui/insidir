/* /autopilot: a member's rules. Set a rule once; when a proven wallet bets the way it says, the finished Kalshi bet is
 * pushed within seconds (lib/autopilot/engine.ts). Starter rules turn on in one tap, each with its real backtest; every
 * rule keeps a paper portfolio; the log shows each match and each skip with its reason. Insidir never places a bet. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, Stage } from "@/components/system";
import { Rows } from "@/components/system/Figures";
import { RuleForm } from "@/components/system/RuleForm";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { backtestsFor, logFor, rulesFor } from "@/lib/autopilot/queries";
import { describe } from "@/lib/autopilot/rules";
import { STARTERS } from "@/lib/autopilot/starters";
import { backtestLine, paperLine } from "@/lib/autopilot/text";
import { specKey } from "@/lib/autopilot/backtest";
import { sentAfter } from "@/lib/autopilot/engine";
import { agoText } from "@/lib/moves/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Autopilot", robots: { index: false } };

const NOTICES: Record<string, string> = { saved: "Saved.", deleted: "Rule deleted. Its past matches stay in your log.", full: "You have 20 rules, the most there can be. Delete one first.",
  starter: "That starter rule doesn't exist.", action: "That didn't work. Try again." };
const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);
const BTN = "b-btn b-btn-lg b-ghost";

function Act({ action, id, label, testid }: { action: string; id: number; label: string; testid: string }) {
  return <form method="post" action="/api/autopilot"><input type="hidden" name="action" value={action} /><input type="hidden" name="id" value={id} /><button type="submit" className={BTN} data-testid={testid}>{label}</button></form>;
}

export default async function AutopilotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [viewer, q] = await Promise.all([requireMember("/autopilot"), searchParams]);
  const db = getDb(), now = Date.now(), userId = viewer.user!.id;
  const [rules, log, starterBts] = await Promise.all([rulesFor(db, userId).catch(() => []), logFor(db, userId).catch(() => []), backtestsFor(db, STARTERS.map(s => s.spec)).catch(() => new Map())]);
  const on = rules.filter(r => r.active);
  const week = log.filter(m => (m.status === "sent" || m.status === "quiet") && m.matchedAt.getTime() > now - 7 * 86_400_000).length;
  const notice = q.saved ? NOTICES.saved : q.deleted ? NOTICES.deleted : q.on ? `${STARTERS.find(s => s.key === q.on)?.name ?? "The rule"} is on.` : q.error ? NOTICES[q.error] ?? NOTICES.action : null;
  const insight = on.length ? `${on.length} ${on.length === 1 ? "rule" : "rules"} on. ${week ? `${week} ${week === 1 ? "match" : "matches"} this week.` : "No matches this week yet."}` : null;
  return (
    <Frame member current="autopilot" testid="autopilot-page">
      <Stage first className="ap-stage" testid="autopilot-head" labelledBy="ap-h">
        <div className="b-head">
          <h1 id="ap-h" className="b-h2 ap-h1" data-testid="insight">{insight ?? "Autopilot."}</h1>
          <p className="b-sub">Set a rule once. When a proven wallet bets the way it says, you get the finished Kalshi bet within seconds: the market, the side, a limit price and the number of contracts. You place it.</p>
          {notice ? <p className="b-msg" role="status" data-testid="ap-notice">{notice}</p> : null}
        </div>

        <section className="ap-sec" data-testid="ap-starters" aria-labelledby="ap-st">
        <div className="b-head"><h2 id="ap-st" className="b-h2 ap-h2">Start with one tap.</h2></div>
        <div className="s-col s-col--wide ap-grid">
          {STARTERS.map(s => {
            const mine = rules.find(r => r.starter === s.key), active = Boolean(mine?.active);
            return (
              <Panel key={s.key} className="s-form" testid="ap-starter" data-key={s.key} data-on={active ? "1" : "0"}>
                <h3 className="b-label">{s.name}</h3>
                <p className="b-small">{s.blurb}</p>
                <p className="b-small" data-testid="ap-backtest">{backtestLine(starterBts.get(specKey(s.spec)) ?? null)}</p>
                {active ? <p className="b-small" data-testid="ap-starter-on">On.</p> : (
                  <form method="post" action="/api/autopilot"><input type="hidden" name="action" value="starter" /><input type="hidden" name="key" value={s.key} />
                    <button type="submit" className="b-btn b-btn-lg b-primary" data-testid="ap-turn-on">Turn on</button></form>
                )}
              </Panel>
            );
          })}
        </div>
        </section>

        <section className="ap-sec" data-testid="ap-rules" aria-labelledby="ap-r">
        <div className="b-head"><h2 id="ap-r" className="b-h2 ap-h2">Your rules.</h2></div>
        <div className="s-col s-col--wide">
          {rules.length ? rules.map(r => (
            <Panel key={r.id} className="s-form" testid="ap-rule" data-active={r.active ? "1" : "0"}>
              <h3 className="b-label">{r.name}{r.active ? "" : " (off)"}</h3>
              <p className="b-small">{describe(r.spec)}</p>
              <p className="b-small" data-testid="ap-paper">{paperLine(r.paper)}</p>
              <p className="b-small" data-testid="ap-rule-backtest">{backtestLine(r.backtest)}</p>
              <div className="b-ctas">
                <Act action="toggle" id={r.id} label={r.active ? "Turn off" : "Turn on"} testid="ap-toggle" />
                <Act action="delete" id={r.id} label="Delete" testid="ap-delete" />
              </div>
              <details><summary className="b-small">Edit</summary><RuleForm id={r.id} name={r.name} spec={r.spec} testid="ap-edit" /></details>
            </Panel>
          )) : <Panel className="s-form"><p className="b-small" data-testid="ap-none">No rules yet. Turn on a starter above, or build your own below.</p></Panel>}
          <Panel className="s-form" testid="ap-new">
            <details open={!rules.length}><summary className="b-label">Build a rule</summary><RuleForm /></details>
          </Panel>
        </div>
        </section>

        <section className="ap-sec" data-testid="ap-log" aria-labelledby="ap-l">
        <div className="b-head"><h2 id="ap-l" className="b-h2 ap-h2">Your Autopilot log.</h2></div>
        <div className="s-col s-col--wide">
          {log.length ? <Panel className="s-col s-col--wide"><Rows label="Autopilot log" rows={log.map(m => ({
            key: String(m.id), attrs: { "data-testid": "ap-log-row", "data-status": m.status },
            title: m.status === "sent" || m.status === "quiet" ? <a className="s-link" href={`/t/${m.id}`}>{m.title}</a> : <>{m.title}</>,
            sub: m.status === "sent" || m.status === "quiet"
              ? <><b>{m.outcome}</b> · {m.contracts} at {cents(m.limitPrice)} limit · {m.ruleName} · {sentAfter(m.latencyMs)}{m.status === "quiet" ? " · quiet hours, not pushed" : ""}</>
              : <>{m.reason} · {m.ruleName}</>,
            right: agoText(m.matchedAt.getTime(), now),
          }))} /></Panel> : <Panel className="s-form"><p className="b-small" data-testid="ap-log-empty">Nothing yet. Matches and skips show here, newest first.</p></Panel>}
        </div>
        <p className="b-small b-center">Backtests use the price when Insidir first saw each bet, plus 1¢, and hold to settlement; wallets count as proven only from what they had settled before. Kalshi&apos;s fees aren&apos;t taken off. Past results, not a promise. Insidir never places a bet or holds money.</p>
        </section>
      </Stage>
    </Frame>
  );
}

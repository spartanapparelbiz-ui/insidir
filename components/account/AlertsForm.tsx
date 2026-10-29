"use client";
/* The Alerts page's controls (docs/INSIDIR-V2.md §7): this device on/off (push only: Insidir sends no email), a test alert, quiet hours in the
 * user's own time zone, and custom rules. Everything saves itself. Each control is
 * shown only when its feature is ready; the rest wear a Coming soon badge. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PushButton } from "@/components/app/PushButton";
import { ActionButton, postJson } from "@/components/ui/ActionButton";
import { SoonBadge } from "@/components/v2/ComingSoon";
import { TIME_ERROR } from "@/app/api/settings/validate";
import { minutesOf } from "@/lib/alerts/quiet";
import type { UserSettings } from "@/lib/db/schema";
import { LEAGUES } from "@/lib/moves/types";
import { Field, Toggle, useSaveSettings } from "./fields";

const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
const checkTime = (v: string): string | null => (v === "" || minutesOf(v) !== null ? null : TIME_ERROR);

export interface AlertsReady { push: boolean; email: boolean; daily: boolean; rules: boolean }

export function AlertsForm({ settings, vapidKey, email, pro, proHref, ready }: { settings: UserSettings; vapidKey: string; email: string | null; pro: boolean; proHref: string; ready: AlertsReady }) {
  const save = useSaveSettings();
  const router = useRouter();
  const [quietKey, setQuietKey] = useState(0);
  return (
    <>
      <section className="agroup" aria-labelledby="a-device">
        <h2 id="a-device" className="agroup__h">How we reach you</h2>
        <div className="agroup__body">
          {ready.push ? <PushButton vapidKey={vapidKey} onChange={() => router.refresh()} /> : <p className="afield__hint">Push alerts on this device <SoonBadge /></p>}
          {ready.push ? (
            <div className="row-gap">
              <ActionButton data-testid="test-alert" action={async () => { const r = await postJson("/api/alerts/test", {}, "Test alert sent"); if (r.ok) router.refresh(); return r; }}>
                Send test alert
              </ActionButton>
            </div>
          ) : null}
        </div>
      </section>

      <section className="agroup" aria-labelledby="a-what">
        <h2 id="a-what" className="agroup__h">What sends an alert</h2>
        <div className="agroup__body">
          <ul className="alist">
            <li>Every move by a trader you follow.</li>
            <li>Every move of $50,000 or more in a market you follow.</li>
          </ul>
          <p className="afield__hint">Follow traders and markets from the feed, a trader&apos;s page or a market&apos;s page.</p>
          <Toggle name="alertSplits" label="New divergences of 15+ points" hint={<>When proven traders and the market diverge on a market, or insiders purchase a falling stock (<a href="/splits">Splits</a>).</>}
            checked={settings.alertSplits !== false} save={save} onLabel="Positioning alerts on" offLabel="Positioning alerts off" />
        </div>
      </section>

      <section className="agroup" aria-labelledby="a-rules">
        <h2 id="a-rules" className="agroup__h">Your own rules {!ready.rules ? <SoonBadge /> : null}</h2>
        <div className="agroup__body">
          {!ready.rules ? <p className="afield__hint">Alerts for any tab, league or size. Coming to Pro.</p>
            : pro ? <RulesEditor initial={settings.moveRules ?? []} />
            : (
              <>
                <p className="afield__hint">With Pro, get an alert for any move that fits your own rule, like &quot;$100k+ on the NFL&quot;.</p>
                <div className="row-gap"><a className="btn btn--secondary" href={proHref} data-unlock="rules">Go Pro</a></div>
              </>
            )}
        </div>
      </section>

      <section className="agroup" aria-labelledby="a-quiet">
        <h2 id="a-quiet" className="agroup__h">Quiet hours</h2>
        <div className="agroup__body" key={quietKey}>
          <p className="afield__hint">No alerts between these times, in your time zone ({settings.timeZone ?? browserZone()}). Moves made then aren&apos;t sent later.</p>
          <div className="afields2">
            <Field name="quietStart" label="From" type="time" value={settings.quietStart ?? ""} check={checkTime} save={save} extra={() => ({ timeZone: browserZone() })} width={200} />
            <Field name="quietEnd" label="Until" type="time" value={settings.quietEnd ?? ""} check={checkTime} save={save} extra={() => ({ timeZone: browserZone() })} width={200} />
          </div>
          {settings.quietStart || settings.quietEnd ? (
            <div className="row-gap">
              <ActionButton variant="ghost" action={async () => {
                const r = await postJson("/api/settings", { quietStart: null, quietEnd: null }, "Quiet hours off");
                if (r.ok) { setQuietKey(k => k + 1); router.refresh(); }
                return r;
              }}>Turn off quiet hours</ActionButton>
            </div>
          ) : null}
        </div>
      </section>

    </>
  );
}

type Rule = NonNullable<UserSettings["moveRules"]>[number];
const SIZES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000];
const sizeLabel = (n: number) => `$${n >= 1000 ? `${n / 1000}k` : n}+`;

/** Pro: up to 10 rules, each a tab, a league (sports only) and a size. Saved as a whole list. */
function RulesEditor({ initial }: { initial: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(initial);
  const [draft, setDraft] = useState<Rule>({ tab: "sports", league: null, min: 100_000 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const commit = async (next: Rule[], ok: string) => {
    const r = await postJson("/api/settings", { moveRules: next }, ok);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setRules(next);
  };
  const describe = (r: Rule) => `${sizeLabel(r.min)} ${r.league ? `on the ${r.league}` : r.tab === "sports" ? "in Sports" : r.tab === "markets" ? "in Markets" : "anywhere"}`;
  return (
    <div className="rules" data-testid="rules">
      {rules.length ? (
        <ul className="rules__list">
          {rules.map((r, i) => (
            <li key={i} className="rules__row">
              <span>{describe(r)}</span>
              <button type="button" className="btn btn--ghost" onClick={() => commit(rules.filter((_, j) => j !== i), "Rule removed")}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="afield__hint">No rules yet. Add one below.</p>}
      {rules.length < 10 ? (
        <div className="rules__add">
          <label className="afield">
            <span className="afield__label">Where</span>
            <select className="input" value={draft.league ?? draft.tab ?? "any"} onChange={e => {
              const v = e.target.value;
              setDraft(d => v === "any" ? { ...d, tab: null, league: null } : v === "sports" || v === "markets" ? { ...d, tab: v, league: null } : { ...d, tab: "sports", league: v });
            }}>
              <option value="any">Anywhere</option>
              <option value="sports">All sports</option>
              {LEAGUES.filter(l => l !== "other").map(l => <option key={l} value={l}>{l === "college" ? "College sports" : l}</option>)}
              <option value="markets">Markets</option>
            </select>
          </label>
          <label className="afield">
            <span className="afield__label">Size</span>
            <select className="input" value={draft.min} onChange={e => setDraft(d => ({ ...d, min: Number(e.target.value) }))}>
              {SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn--secondary" onClick={() => commit([...rules, draft], "Rule added")}>Add rule</button>
        </div>
      ) : null}
      {msg ? <p className={msg.ok ? "afield__hint" : "afield__err"} role="status">{msg.text}</p> : null}
    </div>
  );
}

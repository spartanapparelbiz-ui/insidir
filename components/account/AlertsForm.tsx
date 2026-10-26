"use client";
/* The Alerts page's controls: this device on/off, the email backup, what sends an alert (return, safety lights,
 * categories), quiet hours in the user's own time zone, and a test alert. Everything saves itself. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PushButton } from "@/components/app/PushButton";
import { ActionButton, postJson } from "@/components/ui/ActionButton";
import { CATEGORIES, CATEGORY_LABEL, checkRoiPct, TIME_ERROR } from "@/app/api/settings/validate";
import { minutesOf } from "@/lib/alerts/quiet";
import type { UserSettings } from "@/lib/db/schema";
import { Categories, Choice, Field, Toggle, useSaveSettings } from "./fields";

const pct = (v: number): string => String(Math.round(v * 10_000) / 100);
const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
const checkTime = (v: string): string | null => (v === "" || minutesOf(v) !== null ? null : TIME_ERROR);

export function AlertsForm({ settings, vapidKey, email }: { settings: UserSettings; vapidKey: string; email: string | null }) {
  const save = useSaveSettings();
  const router = useRouter();
  const [quietKey, setQuietKey] = useState(0);
  return (
    <>
      <section className="agroup" aria-labelledby="a-device">
        <h2 id="a-device" className="agroup__h">On this device</h2>
        <div className="agroup__body">
          <PushButton vapidKey={vapidKey} onChange={() => router.refresh()} />
          <Toggle name="alertEmail" label="Email me alerts when push isn't on" checked={settings.alertEmail} save={save} onLabel="Email alerts on" offLabel="Email alerts off"
            hint={email ? `They go to ${email}, the email on your Whop account.` : "Your Whop account has no email. Add one on Whop to get email alerts."} disabled={!email} />
          <div className="row-gap">
            <ActionButton data-testid="test-alert" action={async () => { const r = await postJson("/api/alerts/test", {}, "Test alert sent"); if (r.ok) router.refresh(); return r; }}>
              Send test alert
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="agroup" aria-labelledby="a-what">
        <h2 id="a-what" className="agroup__h">What sends an alert</h2>
        <div className="agroup__body">
          <Field name="alertMinRoiPct" label="Lowest return" suffix="%" value={pct(settings.alertMinRoi)} check={checkRoiPct} save={save} width={240}
            hint="Only deals at or above this return. Your feed's lowest return applies too." />
          <Choice<"green" | "green_yellow"> name="alertSafety" legend="Safety lights" value={settings.alertSafety} save={save}
            options={[{ value: "green", label: "Same rules only", hint: "Both apps settle it the same way." }, { value: "green_yellow", label: "Same rules and Check rules", hint: "Adds deals with small differences in the rules." }]} />
          <Categories name="alertCategories" legend="Categories" hint="Leave them all off to get alerts in every category." save={save}
            options={CATEGORIES.map(c => ({ value: c as string, label: CATEGORY_LABEL[c] }))} value={settings.alertCategories} />
        </div>
      </section>

      <section className="agroup" aria-labelledby="a-quiet">
        <h2 id="a-quiet" className="agroup__h">Quiet hours</h2>
        <div className="agroup__body" key={quietKey}>
          <p className="afield__hint">No alerts between these times, in your time zone ({settings.timeZone ?? browserZone()}). Deals found then aren&apos;t sent later.</p>
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

      <section className="agroup" aria-labelledby="a-more">
        <h2 id="a-more" className="agroup__h">Also</h2>
        <div className="agroup__body">
          <Toggle name="emailDigest" label="Email me a daily summary" hint="One email a day with the best deals." checked={settings.emailDigest} save={save} disabled={!email} />
          <Toggle name="soundOnGreen" label="Play a short sound in the Terminal" hint="When a “Same rules” deal shows up while the Terminal is open." checked={settings.soundOnGreen} save={save} />
        </div>
      </section>
    </>
  );
}

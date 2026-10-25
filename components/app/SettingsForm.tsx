"use client";
/* The settings form. A plain form POST to /api/settings (works without JS); the only client logic is showing the
 * venues that match the chosen region: US users only ever see Kalshi and Polymarket US. No bankroll. */
import { useState } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/app/api/settings/validate";
import type { UserSettings } from "@/lib/db/schema";
import type { Region } from "@/lib/types";
import { PushButton } from "./PushButton";

const pct = (v: number): string => String(Math.round(v * 10_000) / 100);

export function SettingsForm({ settings, region, paid, vapidKey, email }: {
  settings: UserSettings; region: Region | null; paid: boolean; vapidKey: string; email: string | null;
}) {
  const [reg, setReg] = useState<Region>(region ?? "us");
  const [kalshi, setKalshi] = useState(settings.venues.includes("kalshi"));
  // One Polymarket box whose value follows the region: the US exchange for US users, the international site otherwise.
  const [poly, setPoly] = useState(settings.venues.includes(region === "non_us" ? "polymarket" : "polymarket_us"));
  const polyVenue = reg === "us" ? "polymarket_us" : "polymarket";
  return (
    <form className="setform" method="post" action="/api/settings">
      <input type="hidden" name="form" value="settings" />

      <fieldset className="card fs">
        <legend className="fs__h">Where are you?</legend>
        <label className="check"><input type="radio" name="region" value="us" checked={reg === "us"} onChange={() => setReg("us")} />In the US</label>
        <label className="check"><input type="radio" name="region" value="non_us" checked={reg === "non_us"} onChange={() => setReg("non_us")} />Outside the US</label>
        <p className="dim small">{reg === "us" ? "US users see Kalshi and Polymarket US only." : "You see Kalshi and Polymarket."}</p>
      </fieldset>

      <fieldset className="card fs">
        <legend className="fs__h">Venues you can use</legend>
        <label className="check"><input type="checkbox" name="venues" value="kalshi" checked={kalshi} onChange={e => setKalshi(e.target.checked)} />Kalshi</label>
        <label className="check"><input type="checkbox" name="venues" value={polyVenue} checked={poly} onChange={e => setPoly(e.target.checked)} />{reg === "us" ? "Polymarket US" : "Polymarket"}</label>
      </fieldset>

      <fieldset className="card fs">
        <legend className="fs__h">Filters</legend>
        <div className="fs__row">
          <div className="field"><label htmlFor="s-roi">Min ROI (%)</label><input id="s-roi" className="input" name="minRoiPct" inputMode="decimal" defaultValue={pct(settings.minRoi)} /></div>
          <div className="field"><label htmlFor="s-size">Min size ($)</label><input id="s-size" className="input" name="minSizeUsd" inputMode="decimal" defaultValue={String(settings.minSizeUsd)} /></div>
        </div>
        <p className="fs__sub">Categories <span className="dim">(none ticked = all)</span></p>
        <div className="chips">
          {CATEGORIES.map(c => (
            <label key={c} className="chip"><input type="checkbox" name="categories" value={c} defaultChecked={settings.categories.includes(c)} />{CATEGORY_LABEL[c]}</label>
          ))}
        </div>
        <label className="check"><input type="checkbox" name="showYellow" defaultChecked={settings.showYellow} />Show yellow deals (minor rule differences)</label>
        <label className="check"><input type="checkbox" name="showRed" defaultChecked={settings.showRed} />Show red deals (the rules differ)</label>
      </fieldset>

      <fieldset className="card fs" id="alerts">
        <legend className="fs__h">Alerts</legend>
        {paid ? (
          <>
            <label className="check"><input type="checkbox" name="alertPush" defaultChecked={settings.alertPush} />Push alerts</label>
            <PushButton vapidKey={vapidKey} />
            <label className="check"><input type="checkbox" name="alertEmail" defaultChecked={settings.alertEmail} />Email me alerts when push isn&apos;t on</label>
            <div className="field"><label htmlFor="s-aroi">Alert only at or above ROI (%)</label><input id="s-aroi" className="input" name="alertMinRoiPct" inputMode="decimal" defaultValue={pct(settings.alertMinRoi)} /></div>
          </>
        ) : <p className="muted small">Push and email alerts come with Insidir and Insidir Pro.</p>}
        <label className="check"><input type="checkbox" name="emailDigest" defaultChecked={settings.emailDigest} />Email me a daily summary</label>
        <div className="field"><label htmlFor="s-email">Email (from your Whop account)</label>
          <input id="s-email" className="input" value={email ?? "No email on your Whop account"} readOnly aria-readonly="true" /></div>
      </fieldset>

      <button type="submit" className="btn btn--primary btn--block">Save settings</button>
    </form>
  );
}

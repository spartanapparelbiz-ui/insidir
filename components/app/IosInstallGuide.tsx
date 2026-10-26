"use client";
/* iPhone/iPad, when Insidir isn't already installed: how to add it to the Home Screen, which iOS requires before a
 * site can send push alerts. Inside Instagram's or Facebook's in-app browser (where most visitors arrive) it first
 * says to open the page in Safari, since Add to Home Screen isn't available there. Dismissible; remembered in
 * localStorage. Renders nothing elsewhere. */
import { useEffect, useState } from "react";
import { isIos, isStandalone } from "./push";
import "./ios.css";

const KEY = "insidir_ios_guide_dismissed";

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|Instagram|FBAN|FBAV)/.test(ua);
}
const isInApp = (): boolean => /(Instagram|FBAN|FBAV)/.test(navigator.userAgent);

/** The iOS Share glyph (a box with an arrow), drawn inline so the step matches the real button. */
function ShareGlyph() {
  return (
    <svg className="ios__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** `inline`: part of another flow (onboarding's alerts step): no Close, and shown even if dismissed before. */
export function IosInstallGuide({ inline = false }: { inline?: boolean } = {}) {
  const [show, setShow] = useState<false | "safari" | "inapp">(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = !inline && localStorage.getItem(KEY) === "1"; } catch { dismissed = false; }
    if (dismissed || !isIos() || isStandalone()) return;
    if (isSafari()) setShow("safari");
    else if (isInApp()) setShow("inapp");
  }, [inline]);
  if (!show) return null;
  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode: just hide */ }
    setShow(false);
  };
  return (
    <aside className="ios card" aria-labelledby="ios-h">
      <div className="ios__top">
        <p id="ios-h" className="ios__h">Add Insidir to your Home Screen to get instant alerts</p>
        {inline ? null : <button type="button" className="btn btn--ghost ios__x" onClick={close} aria-label="Dismiss">Close</button>}
      </div>
      {show === "inapp" ? (
        <ol className="ios__steps">
          <li>Tap <b>•••</b> at the top right, then <b>Open in external browser</b> (Safari).</li>
          <li>In Safari, tap the Share button <ShareGlyph />, then <b>Add to Home Screen</b>.</li>
          <li>Open Insidir from the new icon and turn on alerts on the Alerts page.</li>
        </ol>
      ) : (
      <ol className="ios__steps">
        <li>Tap the Share button <ShareGlyph /> in Safari&apos;s toolbar.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open Insidir from the new icon and turn on alerts on the Alerts page.</li>
      </ol>
      )}
    </aside>
  );
}

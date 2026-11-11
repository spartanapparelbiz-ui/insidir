"use client";
/* Turning pings on, for the device in hand. Used by the funnel's push step (variant "stage", with a headline) and by
 * the Pings panel in Account (variant "panel"). It reads this device's state and shows the one path that works there:
 *   computer or Android      one tap, the browser asks, Allow
 *   iPhone in Safari         Share → Add to Home Screen → open it from the Home Screen (iOS only pings Home Screen apps)
 *   inside Instagram, X…     open the page in the real browser (in-app browsers never get pings)
 *   blocked                  where this browser keeps the switch
 *   on                       send a test ping, so they see one now
 * Permission is only ever asked from a tap. */
import { useEffect, useState, type ReactNode } from "react";
import { Arrow, Lines, m } from "@/components/brand/Bits";
import { enablePush, isStandalone, pushState, sendTestPing, thisDevice, type Device, type PushState } from "./push";

type St = PushState | "error" | "in_app";
type Test = "idle" | "sending" | "sent" | "none" | "wait" | "error";

async function serverKey(): Promise<string | null> {
  const j = await fetch("/api/push/key", { cache: "no-store" }).then(r => r.json() as Promise<{ publicKey?: string }>).catch(() => null);
  return j?.publicKey || null;
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

function Steps({ items }: { items: Array<{ icon: ReactNode; title: string; note: string }> }) {
  return (
    <ol className="b-ping-steps" data-testid="ping-steps">
      {items.map((s, i) => (
        <li key={s.title} className="b-glass b-pad" {...m("settle", 0.5 + i * 0.08)}>
          <span className="b-ping-ic">{s.icon}</span>
          <span className="b-ping-tx"><b>{s.title}</b><span className="b-small">{s.note}</span></span>
        </li>
      ))}
    </ol>
  );
}

/** Where this browser keeps the notification switch. */
function unblock(d: Device): string {
  if (d.os === "ios") return "Open your iPhone's Settings, tap Notifications, then Insidir, and turn on Allow Notifications. Then come back here.";
  if (d.os === "android") return "Tap the icon to the left of the address bar, then Permissions, and set Notifications to Allow. Then reload this page.";
  if (d.browser === "safari") return "In Safari, open Settings, then Websites, then Notifications, and set Insidir to Allow. Then reload this page.";
  if (d.browser === "firefox") return "Click the icon to the left of the address bar and remove the blocked notifications permission. Then reload this page.";
  return "Click the icon to the left of the address bar and set Notifications to Allow. Then reload this page.";
}

const HEAD: Record<St, readonly string[]> = {
  off: ["Send me a signal", "when they trade."], error: ["Send me a signal", "when they trade."], unsupported: ["Signals need", "another browser."],
  ios_needs_install: ["Add Insidir to", "your Home Screen."], denied: ["Signals are", "blocked."], on: ["Signals are on."], in_app: ["Open Insidir in", "your browser."],
};

export function PingSetup({ variant, vapidKey = null, categories, onContinue }: {
  variant: "stage" | "panel";
  /** The public key when the page already has it; otherwise it's read from GET /api/push/key on the tap. */
  vapidKey?: string | null;
  /** "Elections and Sports", for the stage's line about what gets a ping. */
  categories?: string;
  /** The funnel's next step. Its button reads Continue once pings are on, otherwise Not now. */
  onContinue?: () => void;
}) {
  const [st, setSt] = useState<St | null>(null);
  const [dev, setDev] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<Test>("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = thisDevice();
    setDev(d);
    const read = () => pushState().then(s => setSt(d.inApp && s !== "on" ? "in_app" : s)).catch(() => setSt("unsupported"));
    void read();
    window.addEventListener("insidir:push", read);
    // Coming back from the Settings app or another tab: read it again.
    const vis = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("insidir:push", read); document.removeEventListener("visibilitychange", vis); };
  }, []);

  if (st === null || dev === null) return <div className="b-ping" aria-busy="true" data-testid="ping-setup" />;

  const phone = dev.os === "ios" || dev.os === "android";
  const turnOn = async () => {
    setBusy(true);
    const k = vapidKey || (await serverKey());
    const next = k ? await enablePush(k).catch(() => "error" as const) : "error";
    setSt(next); setBusy(false);
    window.dispatchEvent(new Event("insidir:push"));
    if (next === "on") { setTest("sending"); setTest(await sendTestPing()); }
  };
  const ping = async () => { setTest("sending"); setTest(await sendTestPing()); };
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { setCopied(false); } };

  let sub: ReactNode = null, body: ReactNode = null, cta: ReactNode = null;
  switch (st) {
    case "off":
    case "error":
      sub = <>A ping the moment a $1M+ wallet opens a $25K+ position{categories ? ` in ${categories}` : " in your categories"}, with one tap to the market. At most 8 a day, never 11pm–8am.</>;
      cta = <button type="button" className="b-btn b-btn-lg b-primary" onClick={turnOn} disabled={busy} data-testid="ping-on" {...m("settle", 0.9)}>{busy ? "Waiting for your answer…" : "Turn on signals"}<Arrow /></button>;
      body = st === "error"
        ? <p className="b-msg" role="alert">Pings didn&apos;t turn on. Try again.</p>
        : <p className="b-small" {...m("quiet", 0.95)}>{phone ? "Your phone will ask. Tap Allow." : "Your browser will ask. Click Allow."}</p>;
      break;
    case "ios_needs_install":
      sub = <>iPhones only send pings to apps on the Home Screen. It takes three taps, and Insidir opens like any other app.</>;
      body = <Steps items={[
        { icon: <ShareIcon />, title: "Tap Share", note: "In Safari it's at the bottom of the screen. In Chrome it's next to the address bar." },
        { icon: <AddIcon />, title: "Tap Add to Home Screen", note: "Scroll down the list if you don't see it, then tap Add." },
        { icon: <img src="/icons/icon-192.png" alt="" width={24} height={24} />, title: "Open Insidir from your Home Screen", note: "Sign in if it asks, then go to Account and tap Turn on signals." },
      ]} />;
      break;
    case "in_app":
      sub = <>Pings don&apos;t work inside {dev.inApp}. Open this page in {dev.os === "ios" ? "Safari" : "Chrome"}: tap the menu (⋯) and choose Open in browser.</>;
      cta = <button type="button" className="b-btn b-btn-lg b-primary" onClick={copy} data-testid="ping-copy" {...m("settle", 0.9)}>{copied ? "Link copied" : "Copy the link"}<Arrow /></button>;
      break;
    case "denied":
      sub = <>This {phone ? "phone" : "browser"} has pings from Insidir turned off.</>;
      body = <p className="b-glass b-pad b-signal-note" {...m("settle", 0.6)} data-testid="ping-unblock">{unblock(dev)}</p>;
      break;
    case "unsupported":
      sub = dev.os === "ios" && isStandalone()
        ? <>Pings need iOS 16.4 or later. Update your iPhone in Settings, then General, then Software Update.</>
        : <>This browser can&apos;t show pings. Open Insidir in Chrome, Safari, Edge or Firefox.</>;
      break;
    case "on":
      sub = <>{phone ? "Signals show up on your phone like a text message, even when the screen is off." : "Signals show up in the corner of your screen, even with this tab closed, as long as the browser is open."}</>;
      cta = <button type="button" className="b-btn b-btn-lg b-ghost" onClick={ping} disabled={test === "sending"} data-testid="ping-test" {...m("settle", 0.9)}>{test === "sending" ? "Sending…" : "Send a test signal"}</button>;
      body = test === "sent" ? <p className="b-small b-signal-ok" role="status"><Check /> Sent. It should be on your screen now.</p>
        : test === "none" ? <p className="b-msg" role="status">This device isn&apos;t linked yet. Turn pings off and on in Account.</p>
        : test === "wait" ? <p className="b-small" role="status">One test at a time. Try again in a few seconds.</p>
        : test === "error" ? <p className="b-msg" role="alert">The test didn&apos;t send. Try again.</p> : null;
      break;
  }

  const next = onContinue
    ? <button type="button" className={`b-btn b-btn-lg ${st === "on" || !cta ? "b-primary" : "b-ghost"}`} onClick={onContinue} data-testid="ping-next" {...m("settle", 0.97)}>
        {st === "on" ? <>Continue<Arrow /></> : st === "ios_needs_install" ? "I'll do it later" : "Not now"}
      </button>
    : null;

  return (
    <div className={`b-signal b-signal--${variant}`} data-testid="ping-setup" data-state={st} data-os={dev.os}>
      {variant === "stage" ? <Lines as="h1" lines={HEAD[st]} size={64} /> : <p className="s-strong">{HEAD[st].join(" ")}</p>}
      <p className={variant === "stage" ? "b-sub" : "b-small"} {...m("lift", 0.58)}>{sub}</p>
      {body}
      {cta || next ? <div className="b-ctas">{cta}{next}</div> : null}
    </div>
  );
}

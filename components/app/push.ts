/* Web push in the browser: subscribe/unsubscribe this device. Permission is only ever requested from a tap (iOS
 * requires it; everywhere else it's just polite). Browser only. */
export type PushState = "unsupported" | "ios_needs_install" | "denied" | "off" | "on";

export const isIos = (): boolean =>
  /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;

export interface Device {
  os: "ios" | "android" | "mac" | "windows" | "other";
  browser: "safari" | "chrome" | "edge" | "firefox" | "samsung" | "other";
  /** The app whose built-in browser this is (Instagram, X, TikTok…): web push never works there. */
  inApp: string | null;
}

const IN_APP: Array<[RegExp, string]> = [
  [/Instagram/, "Instagram"], [/FBAN|FBAV|FB_IAB/, "Facebook"], [/Twitter/, "X"], [/TikTok|musical_ly|BytedanceWebview/, "TikTok"],
  [/Snapchat/, "Snapchat"], [/LinkedInApp/, "LinkedIn"], [/Pinterest/, "Pinterest"], [/Discord/, "Discord"], [/ Line\//, "LINE"],
];

/** Which device and browser, from what the browser reports (pure, so it can be tested). */
export function detectDevice(ua: string, platform = "", maxTouchPoints = 0): Device {
  const ios = /iP(hone|od|ad)/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const os: Device["os"] = ios ? "ios" : /Android/.test(ua) ? "android" : /Macintosh|Mac OS X/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  const browser: Device["browser"] = /Edg(e|A|iOS)?\//.test(ua) ? "edge" : /SamsungBrowser/.test(ua) ? "samsung" : /Firefox|FxiOS/.test(ua) ? "firefox"
    : /Chrome|CriOS|Chromium/.test(ua) ? "chrome" : /Safari/.test(ua) ? "safari" : "other";
  const named = IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
  return { os, browser, inApp: named ?? (os === "android" && /; wv\)/.test(ua) ? "this app" : null) };
}

export const thisDevice = (): Device => detectDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

/** Sends a test push to every device this account turned pings on for. */
export async function sendTestPing(): Promise<"sent" | "none" | "wait" | "error"> {
  const r = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
  if (!r) return "error";
  if (r.status === 429) return "wait";
  const j = (await r.json().catch(() => null)) as { sent?: number } | null;
  return r.ok ? ((j?.sent ?? 0) > 0 ? "sent" : "none") : "error";
}

const supported = (): boolean => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** This device's current state, without asking for anything. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "ios_needs_install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Asks for permission (call from a tap), subscribes and stores the subscription. */
export async function enablePush(vapidPublicKey: string): Promise<PushState | "error"> {
  if (!supported()) return isIos() && !isStandalone() ? "ios_needs_install" : "unsupported";
  if (!vapidPublicKey) return "error";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return res.ok ? "on" : "error";
}

export async function disablePush(): Promise<PushState | "error"> {
  if (!supported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  }
  return "off";
}

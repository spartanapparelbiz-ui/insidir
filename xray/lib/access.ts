/* Free vs paid, decided on the server. Locked data is removed before it is rendered or sent, never hidden in
 * the browser.
 *
 *   PAYWALL=on          non-members see the market, the verdict headline, the insider pattern count and level,
 *                       and the flow headline; wallet names, sizes, records and flag details are removed
 *   MEMBER_TOKEN        the shared secret the placeholder member check compares against
 *   WHOP_CHECKOUT_URL   where "Unlock the full X-ray" goes
 *
 * PAYWALL is off unless set to "on", so everything works in development. */
import type { Xray } from "./xray";

export const MEMBER_COOKIE = "insidir_member";

export const paywallOn = (): boolean => process.env.PAYWALL === "on";
export const checkoutUrl = (): string => process.env.WHOP_CHECKOUT_URL || "https://whop.com/";

/* PLACEHOLDER: this is not real membership verification. Anyone who knows MEMBER_TOKEN can unlock, and the
 * cookie never expires on cancellation. Replace it with Whop: verify the member's Whop session or license key
 * server-side (Whop's API, checking an active membership for the product) and keep the result in a signed
 * session cookie. Every caller goes through isMember(), so only this function needs to change. */
export function isMember(cookieValue: string | undefined): boolean {
  const token = process.env.MEMBER_TOKEN;
  return Boolean(token && cookieValue && cookieValue === token);
}

export const canSeeAll = (cookieValue: string | undefined): boolean => !paywallOn() || isMember(cookieValue);

/** The X-ray a non-member may receive: every wallet-level detail removed. */
export function redact(x: Xray): Xray {
  return {
    ...x,
    locked: true,
    sharp: { ...x.sharp, detail: null, wallets: null },
    insider: { ...x.insider, flags: null },
    flow: { ...x.flow, net: null },
  };
}

export const forViewer = (x: Xray, cookieValue: string | undefined): Xray => (canSeeAll(cookieValue) ? x : redact(x));

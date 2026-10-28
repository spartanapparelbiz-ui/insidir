/* Fire-and-forget funnel events to POST /api/events (names in lib/analytics.ts CLIENT_EVENTS). Browser only. */
export type BeaconName = "unlock_click" | "checkout_start" | "onboarding_done" | "onboarding_skip" | "hero_cta_click" | "ticker_click" | "feed_preview_view" | "lock_view" | "offer_view";

export function beacon(name: BeaconName, where: string): void {
  try {
    const body = JSON.stringify({ name, where: where.slice(0, 40) });
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // Measurement never blocks the click.
  }
}

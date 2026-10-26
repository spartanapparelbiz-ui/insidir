/* Fire-and-forget funnel events to POST /api/events (names in lib/analytics.ts CLIENT_EVENTS). Browser only. */
export function beacon(name: "unlock_click" | "checkout_start" | "onboarding_done" | "onboarding_skip", where: string): void {
  try {
    const body = JSON.stringify({ name, where: where.slice(0, 40) });
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // Measurement never blocks the click.
  }
}

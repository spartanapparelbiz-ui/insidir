/* Tiny progressive enhancement for social links. No fake data or API dependency. */
(() => {
  "use strict";
  const query = new URLSearchParams(location.search);
  const raw = (query.get("t") || "").trim().toUpperCase();
  const ticker = raw.startsWith("$") ? raw.slice(1) : raw;
  const input = document.getElementById("check-q");
  if (input && /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) input.value = ticker;
  // Preserve only a fixed campaign label. Never include a query, email or visitor identity.
  const source = (query.get("utm_source") || "").toLowerCase();
  if (!["tiktok","instagram","facebook"].includes(source)) return;
  document.querySelectorAll(".check-popular a").forEach(a => {
    const u = new URL(a.href, location.origin);
    u.searchParams.set("utm_source", source);
    a.href = u.pathname + u.search;
  });
})();

/* Alerts: how often new briefing items are delivered (immediate, daily or weekly). Read from and saved to
   /v1/me/intelligence/preferences, the same choice the Intelligence page offers; a failed save puts the previous
   choice back and says so. Arrow keys move between the options, as in any radio group. */
(() => {
  "use strict";
  const group = document.querySelector("[data-al-frequency]"), status = document.querySelector("[data-al-frequency-status]");
  if (!group || !status) return;
  const buttons = [...group.querySelectorAll("[role=radio]")];
  const LABEL = { immediate: "a notification for each new filing", daily: "a daily digest", weekly: "a weekly digest" };
  let current = null, saving = false;
  const mark = value => buttons.forEach(b => {
    const on = b.dataset.value === value;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on || (!value && b === buttons[0]) ? 0 : -1;
  });
  async function call(method, body) {
    const res = await fetch("/v1/me/intelligence/preferences", { method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Insidir didn't answer");
    return data;
  }
  async function choose(value) {
    if (saving || value === current) return;
    const before = current;
    saving = true; mark(value); group.setAttribute("aria-busy", "true");
    status.textContent = "Saving…";
    try {
      const r = await call("POST", { frequency: value });
      current = r.frequency || value; mark(current);
      status.textContent = "Saved: you'll get " + LABEL[current] + ".";
    } catch (e) {
      mark(before);
      status.textContent = "Your choice wasn't saved (" + e.message + "). It is still " + (LABEL[before] || "unchanged") + ".";
    } finally { saving = false; group.removeAttribute("aria-busy"); }
  }
  buttons.forEach(b => b.addEventListener("click", () => choose(b.dataset.value)));
  group.addEventListener("keydown", e => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.focus(); choose(next.dataset.value);
  });
  call("GET").then(r => {
    if (!LABEL[r.frequency]) { mark(null); status.textContent = "Choose how often you want to hear about new records."; return; }
    current = r.frequency; mark(current);
    status.textContent = "Currently " + LABEL[current] + "." + (r.pushConfigured === false ? " Device notifications are not switched on for Insidir yet; your choice is kept for when they are." : "");
  }).catch(() => { mark(null); status.textContent = "Your current choice couldn't be loaded. Choosing one saves it."; });
})();

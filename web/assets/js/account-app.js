/* Settings (account.html) on the rebuilt app: who is logged in, the subscription in one line with the one action that
   fixes or manages it (and a one-step cancel), password and sessions with the recent security log, a copy of your data,
   privacy, and account deletion. DELETE /v1/me needs the password and cancels any Stripe subscription before removing
   the account; when that cancellation fails the account is kept and the server's reason is shown. After a deletion
   the browser goes to account-deleted.html. Insidir sends no email.
   API: GET /v1/me, GET /v1/billing/status?refresh=1, POST /v1/billing/cancel, POST /v1/auth/logout,
   GET /v1/me/security-events, POST /v1/me/password, POST /v1/me/sessions/revoke-others, GET /v1/me/export, DELETE /v1/me. */
(() => {"use strict";
const UI = window.InsidirUI; if (!UI) return;
const $ = id => document.getElementById(id);
const HINT = "insidir:signed-in";
const forget = () => { try { localStorage.removeItem(HINT); } catch { /* storage unavailable */ } };
const req = (path, method = "GET", body) => UI.api(path, { method, body });
const dateText = iso => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : ""; };
const sentence = t => String(t || "").trim().replace(/([^.!?])$/, "$1.");
function say(el, text, bad) { el.classList.toggle("is-error", !!bad); el.textContent = text || ""; }
/* The engine's own reason when it gave one (ui.js uses "Something went wrong" when it did not), else the fallback. */
const why = (e, fallback, offline = "We couldn't reach Insidir. Check your connection and try again.") =>
  e instanceof TypeError ? offline : e?.message && e.message !== "Something went wrong" ? sentence(e.message) : fallback;

/* ---------- subscription ---------- */
/* A live Stripe subscription that needs attention is fixed in Billing (Stripe's portal), never with a new checkout. */
const FIX = { past_due: ["Payment past due · access paused", "Update payment"], unpaid: ["Unpaid invoice · access paused", "Update payment"],
  incomplete: ["First payment pending · access paused", "Finish payment"], paused: ["Paused · access paused", "Resume subscription"] };
const CANCELLABLE = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
let billing = null;
function plan(access) {
  if (!access) return "Subscription status unavailable";
  if (access.complimentary && access.active) return "Complimentary access";
  if (access.active && access.status === "trialing") { const end = dateText(access.currentPeriodEnd); return "Trial" + (end ? " · ends " + end : "") + " · then $39 a month unless cancelled"; }
  if (access.active) { const end = dateText(access.currentPeriodEnd); return "Active" + (end ? " · current period ends " + end : ""); }
  if (FIX[access.status]) return FIX[access.status][0];
  if (access.billingEnabled === false) return "Not subscribed · checkout isn't open yet";
  return access.status === "canceled" ? "Cancelled · not subscribed" : "Not subscribed";
}
/* The card's one solid button is the next thing to do; Billing stays one quiet link away. */
function actions(access) {
  const primary = $("account-primary"), note = $("account-plan-note");
  const set = (label, href) => { primary.textContent = label; primary.setAttribute("href", href); };
  if (!access || access.active || access.billingEnabled === false) { set("Open billing", "/billing.html"); return; }
  if (FIX[access.status]) {
    set(FIX[access.status][1], "/billing.html");
    note.textContent = "Your subscription still exists in Stripe but needs attention. Fix it from Billing; there's no need to subscribe again.";
    return;
  }
  set("Subscribe · $39 a month", "/subscribe.html");
  const a = document.createElement("a"); a.href = "/billing.html"; a.textContent = "Billing";
  note.replaceChildren("Insidir is a paid research workspace. Subscribe to open Today, your watchlist and alerts" + (access.status ? "; everything you saved is still here. " : ". ") + "Past invoices and payment details are in ", a, ".");
}
function renderCancellation(b) {
  billing = b;
  const cancel = $("account-cancel"), box = $("account-cancel-confirm");
  const status = String(b?.subscriptionStatus || "").toLowerCase();
  const pending = b?.cancelAtPeriodEnd === true;
  cancel.hidden = !b?.hasCustomer || !CANCELLABLE.has(status) || pending;
  cancel.setAttribute("aria-expanded", "false");
  box.hidden = true;
  if (pending) {
    const until = dateText(b.currentPeriodEnd);
    $("account-plan").textContent = "Cancellation scheduled" + (until ? " · access until " + until : "");
    $("account-plan-note").textContent = "Automatic renewal is off. No further monthly renewal charges are scheduled." + (until ? " Your current access continues until " + until + "." : "");
  }
}

/* ---------- security and data ---------- */
const KIND = { register: "Account created", login_success: "Signed in", logout: "Signed out", login_failure: "Failed sign-in", password_changed: "Password changed",
  password_reset_requested: "Password reset requested", password_reset_completed: "Password reset", email_verified: "Email confirmed",
  email_verification_sent: "Confirmation link sent (before Insidir stopped sending email)", sessions_revoked: "Other devices signed out", data_exported: "Data downloaded",
  password_change_failed: "Password change refused", account_delete_failed: "Deletion refused (wrong password)" };
const list = $("account-events");
function line(text, when) {
  const li = document.createElement("li"), s = document.createElement("span"); s.textContent = text; li.append(s);
  if (when) { const t = document.createElement("time"); t.dateTime = when.toISOString(); t.textContent = when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); li.append(t); }
  return li;
}
async function events() {
  try {
    const r = await req("/v1/me/security-events");
    const rows = (r?.items || []).slice(0, 10).map(e => { const when = new Date(e.created_at); return line(KIND[e.kind] || String(e.kind || "").replace(/_/g, " "), isNaN(when) ? null : when); });
    list.replaceChildren(...(rows.length ? rows : [line("Nothing recorded yet.")]));
  } catch { list.replaceChildren(line("Activity is unavailable right now.")); }
  list.removeAttribute("aria-busy");
}
const out = $("account-security-feedback");
$("account-password-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const cur = $("account-password-current"), next = $("account-password-new");
  if (!cur.value) { say(out, "Enter your current password.", true); return cur.focus(); }
  if (next.value.length < 12 || next.value.length > 128) { say(out, "Use 12 to 128 characters for the new password.", true); return next.focus(); }
  const btn = $("account-password-save"); btn.disabled = true;
  try {
    const r = await req("/v1/me/password", "POST", { currentPassword: cur.value, newPassword: next.value });
    cur.value = next.value = "";
    const n = Number(r?.otherSessionsRevoked) || 0;
    say(out, "Password changed." + (n ? " " + n + " other session" + (n > 1 ? "s were" : " was") + " signed out." : ""));
    events();
  } catch (e) { say(out, why(e, "Your password was not changed. Try again."), true); }
  btn.disabled = false;
});
$("account-sessions-revoke").addEventListener("click", async e => {
  const btn = e.currentTarget; btn.disabled = true;
  try { const r = await req("/v1/me/sessions/revoke-others", "POST", {}); const n = Number(r?.revoked) || 0; say(out, n ? n + " other session" + (n > 1 ? "s were" : " was") + " signed out." : "No other sessions were signed in."); events(); }
  catch (err) { say(out, why(err, "That didn't work. Try again."), true); }
  btn.disabled = false;
});
$("account-export").addEventListener("click", async e => {
  const btn = e.currentTarget, fb = $("account-export-feedback");
  btn.disabled = true; say(fb, "Preparing your file…");
  try {
    const data = await req("/v1/me/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "insidir-account-export.json"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say(fb, "Downloaded insidir-account-export.json."); events();
  } catch (err) { say(fb, why(err, "The download failed. Try again."), true); }
  btn.disabled = false;
});

/* ---------- sign out ---------- */
$("account-signout").addEventListener("click", async () => {
  try { await req("/v1/auth/logout", "POST"); forget(); location.assign("/signin.html"); }
  catch (e) { say($("account-status"), why(e, "We couldn't sign you out just now. Please try again.", "We couldn't sign you out just now. Please try again."), true); }
});

/* ---------- cancel (POST /v1/billing/cancel) ---------- */
const cancel = $("account-cancel"), cancelBox = $("account-cancel-confirm"), cancelOut = $("account-cancel-feedback");
cancel.addEventListener("click", () => {
  const end = dateText(billing?.currentPeriodEnd), trial = billing?.subscriptionStatus === "trialing";
  $("account-cancel-copy").textContent = trial
    ? "The $39 monthly charge will not start. Your $1 trial access continues" + (end ? " until " + end : " until the end of the trial") + "."
    : "You will not be charged at the next monthly renewal. Your current access continues" + (end ? " until " + end : " until the current period ends") + ".";
  say(cancelOut, "");
  cancelBox.hidden = false; cancel.setAttribute("aria-expanded", "true");
  $("account-cancel-yes").focus();
});
$("account-cancel-keep").addEventListener("click", () => {
  cancelBox.hidden = true; cancel.setAttribute("aria-expanded", "false");
  say(cancelOut, "Nothing was changed."); cancel.focus();
});
$("account-cancel-yes").addEventListener("click", async () => {
  const yes = $("account-cancel-yes"), keep = $("account-cancel-keep");
  yes.disabled = keep.disabled = cancel.disabled = true;
  say(cancelOut, "Confirming cancellation with Stripe…");
  try {
    const r = await req("/v1/billing/cancel", "POST", {});
    cancelBox.hidden = true; cancel.setAttribute("aria-expanded", "false"); cancel.hidden = true;
    if (r?.canceled) {
      const until = dateText(r.accessUntil || billing?.currentPeriodEnd);
      renderCancellation({ ...billing, cancelAtPeriodEnd: true, currentPeriodEnd: r.accessUntil || billing?.currentPeriodEnd });
      say(cancelOut, "Subscription cancellation confirmed. No further renewal charges." + (until ? " Your access continues until " + until + "." : ""));
    } else if (r?.alreadyCanceled) {
      $("account-plan").textContent = "Cancelled · not subscribed";
      $("account-plan-note").textContent = "Your subscription is already cancelled. No further renewal charges are scheduled.";
      say(cancelOut, "Your subscription was already cancelled.");
    } else {
      // Never report a confirmed cancellation the server did not explicitly confirm.
      throw Error("Stripe did not confirm cancellation. Please check Billing or contact hello@aethric.llc.");
    }
    $("account-primary").focus();
  } catch (e) {
    say(cancelOut, why(e, "Cancellation could not be confirmed. Please try again or contact hello@aethric.llc.",
      "We couldn't reach Insidir, so cancellation was not confirmed. Check your connection and try again."), true);
    cancel.hidden = false; cancelBox.hidden = false; cancel.setAttribute("aria-expanded", "true");
  } finally { yes.disabled = keep.disabled = cancel.disabled = false; }
});

/* ---------- delete (DELETE /v1/me with the password) ---------- */
const form = $("account-delete-form"), pw = $("account-delete-password"), delOut = $("account-delete-feedback"), del = $("account-delete");
del.addEventListener("click", () => {
  say(delOut, "");
  $("account-delete-email").textContent = $("account-email").textContent || "this account";
  form.hidden = false; del.hidden = true; pw.value = ""; pw.focus();
});
$("account-delete-cancel").addEventListener("click", () => {
  form.hidden = true; del.hidden = false; pw.value = ""; say(delOut, "Nothing was changed."); del.focus();
});
form.addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!pw.value) { say(delOut, "Enter your password to delete the account.", true); pw.focus(); return; }
  const btn = $("account-delete-confirm"); btn.disabled = true;
  say(delOut, "Cancelling any subscription and deleting your account…");
  try { await req("/v1/me", "DELETE", { password: pw.value }); pw.value = ""; forget(); location.assign("/account-deleted.html"); }
  catch (e) {
    // The engine explains what happened (a wrong password, or Stripe couldn't confirm the cancellation); show it as is.
    say(delOut, why(e, "Your account was not deleted and nothing was changed. Please try again, or email hello@aethric.llc.",
      "We couldn't reach Insidir, so your account was not deleted. Check your connection and try again."), true);
    btn.disabled = false; pw.select();
  }
});

/* ---------- load ---------- */
(async () => {
  try {
    const r = await req("/v1/me");
    $("account-email").textContent = r?.user?.email || "Not available";
    say($("account-status"), "Your session uses a secure, first-party cookie and lasts up to 14 days.");
    $("account-plan").textContent = plan(r?.access);
    actions(r?.access);
    del.disabled = false;
    events();
    // Never show a cancellation button until the server has checked this account's Stripe status.
    try { renderCancellation(await req("/v1/billing/status?refresh=1")); }
    catch { say(cancelOut, "We couldn't verify renewal status here. You can still cancel from Billing."); }
  } catch (e) {
    if (e.status === 401) { forget(); return; } // ui.js is already sending the browser to sign in
    $("account-email").textContent = "Unavailable";
    say($("account-status"), "We couldn't reach the account service. Reload the page in a moment.", true);
    $("account-plan").textContent = "Subscription status unavailable";
    list.replaceChildren(line("Activity is unavailable right now.")); list.removeAttribute("aria-busy");
  }
})();
})();

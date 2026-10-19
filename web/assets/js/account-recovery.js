/* Password recovery and email confirmation (forgot-password.html, reset-password.html, verify-email.html).
   The one-time token arrives in the link's #fragment (never sent to the server in a URL, never in a Referer); it is
   read once, removed from the address bar and sent in a JSON body. The answers are the engine's own words. */
(() => {
  "use strict";
  const EMAIL_RE = /^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/;
  const token = (() => {
    const m = /(?:^|[#&])token=([a-f0-9]{64})(?:&|$)/.exec(location.hash || "");
    if (m) try { history.replaceState(null, "", location.pathname); } catch (_) { /* keep the address */ }
    return m ? m[1] : null;
  })();
  async function call(path, body) {
    let res;
    try { res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); }
    catch (_) { return { status: 0, data: null }; }
    let data = null; try { data = await res.json(); } catch (_) { /* not JSON */ }
    return { status: res.status, data };
  }
  const sentence = s => { const t = String(s || "").trim(); return t && !/[.!?]$/.test(t) ? t + "." : t; };

  document.querySelectorAll("form[data-recovery-form]").forEach(form => {
    const mode = form.dataset.recoveryForm;
    const submit = form.querySelector('button[type="submit"]'), label = submit.querySelector(".auth-btn__label"), idle = label.textContent;
    const alert = form.querySelector(".form-alert"), alertText = form.querySelector(".form-alert__text");
    const say = (text, ok) => { alertText.textContent = text; alert.classList.add("is-visible"); alert.classList.toggle("is-success", !!ok); };
    const pending = on => { submit.disabled = on; submit.classList.toggle("is-pending", on); submit.setAttribute("aria-busy", on ? "true" : "false"); label.textContent = on ? submit.dataset.pendingLabel : idle; };
    const fieldError = (input, text) => {
      const field = input.closest(".auth-field"), out = field && field.querySelector(".field__error");
      if (text) { input.setAttribute("aria-invalid", "true"); if (out) out.textContent = text; field && field.classList.add("is-invalid"); }
      else { input.removeAttribute("aria-invalid"); field && field.classList.remove("is-invalid"); }
      return !text;
    };
    const failed = r => r.status === 0 ? "Insidir could not be reached. Check your connection and try again."
      : r.status === 429 ? sentence(r.data && r.data.error) || "Too many attempts. Wait a few minutes and try again."
      : sentence(r.data && r.data.error) || "Something went wrong on our side. Try again in a moment.";

    if ((mode === "reset" || mode === "verify") && !token) {
      submit.disabled = true;
      say(mode === "reset" ? "This page needs the link from your reset email. Ask for a new link if yours has expired." : "This page needs the link from your confirmation email. Send a new one from your account.");
      const status = document.querySelector("[data-verify-status]"); if (status) status.textContent = "No confirmation link was found.";
      return;
    }
    if (mode === "verify") { const status = document.querySelector("[data-verify-status]"); if (status) status.textContent = "Select the button to confirm this address for your Insidir account."; }

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (submit.disabled) return;
      alert.classList.remove("is-visible", "is-success");
      if (mode === "forgot") {
        const input = form.elements.namedItem("email"), v = input.value.trim();
        if (!fieldError(input, !v ? "Enter your email address." : EMAIL_RE.test(v) ? "" : "Enter a valid email address, like you@example.com.")) return input.focus();
        pending(true);
        const r = await call("/v1/auth/forgot-password", { email: v });
        pending(false);
        if (r.status === 202) { say(r.data.message, true); submit.disabled = true; } else say(failed(r));
        return;
      }
      if (mode === "reset") {
        const pw = form.elements.namedItem("password"), confirm = form.elements.namedItem("confirm");
        const a = fieldError(pw, pw.value.length < 12 ? "Use at least 12 characters." : pw.value.length > 128 ? "Use 128 characters or fewer." : "");
        const b = fieldError(confirm, confirm.value !== pw.value ? "The two passwords do not match." : "");
        if (!a) return pw.focus(); if (!b) return confirm.focus();
        pending(true);
        const r = await call("/v1/auth/reset-password", { token, password: pw.value });
        pending(false);
        if (r.status === 200) { pw.value = confirm.value = ""; submit.disabled = true; say("Your password was changed and every session was signed out. Log in with your new password.", true);
          try { localStorage.removeItem("insidir:signed-in"); } catch (_) { /* storage unavailable */ }
          const link = document.createElement("a"); link.href = "signin.html"; link.className = "auth-link"; link.textContent = "Log in →"; alertText.append(" ", link); }
        else say(failed(r));
        return;
      }
      pending(true);
      const r = await call("/v1/auth/verify-email", { token });
      pending(false);
      const status = document.querySelector("[data-verify-status]");
      if (r.status === 200) { submit.disabled = true; if (status) status.textContent = "Your email address is confirmed."; say("Thank you. Your email address is confirmed.", true); }
      else say(failed(r));
    });
  });
})();

/* Log in / get started (signin.html, signup.html).
   - Friendly client-side validation with inline, accessible messages.
   - Submits to the engine (POST /v1/auth/login | /v1/auth/register) with a
     tiny same-origin JSON fetch helper (app.js is not loaded on these pages).
   - Insidir is a paid product with a hard paywall:
       new account            → subscribe.html (step 2: secure checkout)
       log in, access active  → the page they were sent from (?next=) or dashboard.html
       log in, no access      → subscribe.html (keeping ?next= for after checkout)
     Access comes from the login response's {access:{active}} or, failing that,
     GET /v1/me; the server gates every product page as well, so this only
     chooses the friendliest first stop.
   - "Already logged in?" asks GET /v1/me only when this browser has signed in
     before (a localStorage hint, never a credential: the session cookie is
     HttpOnly). Anonymous visitors therefore never trigger a 401 in the console.
   - ?next= is only ever honoured for same-origin relative paths to known
     product and account pages (no protocol, no //, no backslashes). */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EMAIL_RE = /^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/;
  const DASHBOARD = "dashboard.html";
  const SUBSCRIBE = "subscribe.html";
  const PAGES = {
    dashboard: "your dashboard", research: "the research desk", explore: "companies", company: "the company report",
    filings: "SEC filings", filing: "the filing", people: "people", person: "the personnel file", watchlist: "your watchlist", portfolio: "your portfolio",
    alerts: "your alerts", billing: "billing", account: "your account", subscribe: "the subscription step"
  };
  // Pages that need a login but no subscription: someone headed there goes straight there.
  const ACCOUNT_PAGES = ["billing", "account", "subscribe"];
  const pageOf = target => target ? target.split(/[.?]/)[0] : "";
  const HINT = "insidir:signed-in";
  const signedInBefore = on => {
    try { if (on === undefined) return localStorage.getItem(HINT) === "1"; if (on) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT); }
    catch (_) { /* storage unavailable: behave as a first visit */ }
    return false;
  };

  /* ---------- next= validation (mirrored in app.js, subscribe.js and the server) ---------- */
  function safeNext(raw) {
    if (typeof raw !== "string" || !raw || raw.length > 600) return null;
    if (/[\\\s\u0000-\u001f]/.test(raw) || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, location.origin + "/"); } catch (_) { return null; }
    if (url.origin !== location.origin) return null;
    const m = /^\/([a-z]+)(?:\.html)?$/.exec(url.pathname);
    if (!m || !Object.prototype.hasOwnProperty.call(PAGES, m[1])) return null;
    return m[1] + ".html" + url.search;
  }
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get("next"));
  const withNext = (page, target) => target ? page + "?next=" + encodeURIComponent(target) : page;

  /* ---------- tiny JSON fetch helper ---------- */
  async function call(path, method = "GET", body) {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      try { data = await res.json(); } catch (_) { data = null; }
    }
    return { status: res.status, ok: res.ok, data };
  }

  /* Where a signed-in person should land: the paywall decides, never the client alone. */
  async function destination(login) {
    if (ACCOUNT_PAGES.includes(pageOf(next))) return next;
    let access = login && login.access && typeof login.access.active === "boolean" ? login.access : null;
    if (!access) {
      try {
        const me = await call("/v1/me");
        access = me.ok && me.data ? me.data.access : null;
      } catch (_) { /* fall through: the server still gates the page */ }
    }
    if (access && access.active === false) return withNext(SUBSCRIBE, next);
    return next || DASHBOARD;
  }

  const sentence = s => {
    const t = String(s || "").trim();
    return t && !/[.!?…]$/.test(t) ? t + "." : t;
  };

  /* ---------- carry ?next= across the log in / get started switch ---------- */
  if (next) {
    document.querySelectorAll("[data-auth-switch]").forEach(a => {
      const page = a.getAttribute("href").split("?")[0];
      a.setAttribute("href", withNext(page, next));
    });
    const context = document.querySelector("[data-auth-context]");
    const key = pageOf(next);
    if (context && PAGES[key]) {
      context.textContent = (document.body.classList.contains("auth-body--signup") ? "Create your account to continue to " : "Log in to continue to ") + PAGES[key] + ".";
      context.hidden = false;
    }
  }

  /* ---------- already signed in? offer the way forward instead of a second login ---------- */
  const session = document.querySelector("[data-auth-session]");
  if (session && signedInBefore()) {
    call("/v1/me").then(me => {
      if (me.status === 401) signedInBefore(false); // the session ended: stop asking on later visits
      if (!me.ok || !me.data || !me.data.user || !me.data.user.email) return;
      const active = !(me.data.access && me.data.access.active === false) || ACCOUNT_PAGES.includes(pageOf(next));
      const who = session.querySelector("[data-auth-session-email]");
      const go = session.querySelector("[data-auth-session-go]");
      if (who) who.textContent = String(me.data.user.email);
      if (go) {
        go.setAttribute("href", active ? (next || DASHBOARD) : withNext(SUBSCRIBE, next));
        go.textContent = active ? "Continue to " + (next ? PAGES[pageOf(next)] : "your dashboard") : "Continue to subscription";
      }
      session.hidden = false;
    }).catch(() => {});
  }

  /* ---------- forms ---------- */
  document.querySelectorAll("form[data-auth-form]").forEach(form => {
    const mode = form.dataset.authForm; // "login" | "register"
    const fields = {
      email: form.elements.namedItem("email"),
      password: form.elements.namedItem("password")
    };
    const submit = form.querySelector('button[type="submit"]');
    const label = submit.querySelector(".auth-btn__label");
    const idleLabel = label.textContent;
    const alert = form.querySelector(".form-alert");
    const alertText = form.querySelector(".form-alert__text");
    const hint = form.querySelector(".field__hint");
    let attempted = false, pending = false;

    function rules(name, value) {
      if (name === "email") {
        const v = value.trim();
        if (!v) return "Enter your email address.";
        if (!EMAIL_RE.test(v)) return "Enter a valid email address, like you@example.com.";
        return "";
      }
      if (name === "password") {
        if (!value) return mode === "register" ? "Create a password." : "Enter your password.";
        if (value.length > 128) return "Use 128 characters or fewer.";
        if (mode === "register" && value.length < 12) {
          const left = 12 - value.length;
          return `Use at least 12 characters — ${left} more to go.`;
        }
        return "";
      }
      return "";
    }

    function setError(input, message) {
      const field = input.closest(".auth-field");
      const out = field && field.querySelector(".field__error");
      if (message) {
        input.setAttribute("aria-invalid", "true");
        if (out) out.textContent = message;
        field && field.classList.add("is-invalid");
      } else {
        input.removeAttribute("aria-invalid");
        field && field.classList.remove("is-invalid");
      }
    }

    function validate() {
      let first = null;
      Object.entries(fields).forEach(([name, input]) => {
        if (!input) return;
        const msg = rules(name, input.value);
        setError(input, msg);
        if (msg && !first) first = input;
      });
      return first;
    }

    function showAlert(message) {
      alertText.textContent = message;
      alert.classList.add("is-visible");
      alert.classList.remove("is-shake");
      void alert.offsetWidth; // restart the nudge animation
      alert.classList.add("is-shake");
    }
    function hideAlert() {
      alert.classList.remove("is-visible", "is-shake");
    }

    function setPending(on, text) {
      pending = on;
      submit.disabled = on;
      submit.classList.toggle("is-pending", on);
      submit.setAttribute("aria-busy", on ? "true" : "false");
      label.textContent = on ? (text || submit.dataset.pendingLabel || idleLabel) : idleLabel;
    }

    // live feedback once the person has tried to submit (or left a field with a value)
    Object.entries(fields).forEach(([name, input]) => {
      if (!input) return;
      input.addEventListener("input", () => {
        if (name === "password" && hint) hint.classList.toggle("is-met", input.value.length >= 12 && input.value.length <= 128);
        if (attempted || input.hasAttribute("aria-invalid")) setError(input, rules(name, input.value));
        if (alert.classList.contains("is-visible")) hideAlert();
      });
      input.addEventListener("blur", () => {
        if (input.value && (attempted || name === "email")) setError(input, rules(name, input.value));
      });
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (pending) return;
      attempted = true;
      hideAlert();
      const invalid = validate();
      if (invalid) { invalid.focus(); return; }

      const body = { email: fields.email.value.trim(), password: fields.password.value };
      if(mode==="register") {
        try {
          const r=JSON.parse(localStorage.getItem("insidir:creator-ref")||"null");
          if(r && r.until>Date.now() && /^[a-z0-9][a-z0-9_-]{2,39}$/.test(r.code))body.ref=r.code;
        } catch (_) { /* storage unavailable */ }
      }
      const path = mode === "register" ? "/v1/auth/register" : "/v1/auth/login";
      setPending(true);

      let res;
      try {
        res = await call(path, "POST", body);
      } catch (_) {
        res = null; // network failure: the engine is not reachable
      }

      if (!res || res.status === 404 || res.status === 405) {
        setPending(false);
        showAlert("Account service is currently unavailable. Please try again later.");
        return;
      }
      if (res.ok) {
        signedInBefore(true);
        if (mode === "register") {
          setPending(true, "Account created");
          const target = withNext(SUBSCRIBE, ACCOUNT_PAGES.includes(pageOf(next)) ? null : next);
          setTimeout(() => location.assign(target), reduce ? 0 : 350);
        } else {
          setPending(true, "Signed in");
          const target = await destination(res.data);
          setTimeout(() => location.assign(target), reduce ? 0 : 250);
        }
        return;
      }

      setPending(false);
      const server = res.data && res.data.error;
      let message;
      switch (res.status) {
        case 401:
          message = "Invalid email or password.";
          break;
        case 403:
          message = mode === "register"
            ? "New accounts aren't open yet. Email hello@aethric.llc to request access."
            : "Logging in isn't available right now. Please try again later.";
          break;
        case 409:
          message = "An account with this email already exists. Log in instead.";
          break;
        case 400:
          message = sentence(server) || "Please check your details and try again.";
          break;
        case 429:
          message = (sentence(server) || "Too many attempts.") + " Please wait a few minutes and try again.";
          break;
        default:
          message = "Something went wrong on our side. Please try again in a moment.";
      }
      showAlert(message);
      if (res.status === 401) {
        // keep the email, clear the password for a clean retry
        fields.password.value = "";
        fields.password.focus();
      } else if (res.status === 409) {
        fields.email.focus();
      } else {
        submit.focus(); // the button was disabled while pending, which drops focus
      }
    });
  });
})();

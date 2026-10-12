/* Sign in / sign up behaviour.
   - Friendly client-side validation with inline, accessible messages.
   - Submits to the engine (POST /v1/auth/login | /v1/auth/register) with a
     tiny same-origin JSON fetch helper (app.js is not loaded on these pages).
   - The static website preview has no /v1 API: a network error or a 404/405
     falls back to the demo dashboard with a toast.
   - Desktop pointer parallax on the photo panel. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const EMAIL_RE = /^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/;
  const RESEARCH_DESK = "research.html";

  const toast = msg => {
    if (window.Insidir && typeof window.Insidir.toast === "function") window.Insidir.toast(msg);
  };

  /* ---------- tiny JSON fetch helper ---------- */
  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    let data = null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      try { data = await res.json(); } catch (_) { data = null; }
    }
    return { status: res.status, ok: res.ok, data };
  }

  const sentence = s => {
    const t = String(s || "").trim();
    return t && !/[.!?…]$/.test(t) ? t + "." : t;
  };

  /* ---------- plan badge (?plan=pro) ---------- */
  const params = new URLSearchParams(location.search);
  const badge = document.querySelector("[data-plan-badge]");
  if (badge && (params.get("plan") || "").toLowerCase() === "pro") badge.hidden = false;

  /* ---------- toasts for not-yet-available actions ---------- */
  document.querySelectorAll("[data-auth-toast]").forEach(btn => {
    btn.addEventListener("click", () => toast(btn.dataset.authToast));
  });

  /* ---------- forms ---------- */
  document.querySelectorAll("form[data-auth-form]").forEach(form => {
    const mode = form.dataset.authForm; // "login" | "register"
    const fields = {
      name: form.elements.namedItem("name"),
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
      if (name === "name") {
        if (!value.trim()) return "Enter your full name.";
        return "";
      }
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

    function goToResearch(delay) {
      setTimeout(() => { location.assign(RESEARCH_DESK); }, delay);
    }

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (pending) return;
      attempted = true;
      hideAlert();
      const invalid = validate();
      if (invalid) { invalid.focus(); return; }

      const body = { email: fields.email.value.trim(), password: fields.password.value };
      const path = mode === "register" ? "/v1/auth/register" : "/v1/auth/login";
      setPending(true);

      let res;
      try {
        res = await post(path, body);
      } catch (_) {
        res = null; // network failure: the engine is not reachable
      }

      if (!res || res.status === 404 || res.status === 405) {
        setPending(false);
        showAlert("Account service is currently unavailable. Please try again later.");
        return;
      }
      if (res.ok) {
        setPending(true, mode === "register" ? "Account created" : "Signed in");
        goToResearch(reduce ? 0 : 350);
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
            ? "New sign-ups aren't open yet. Join the waitlist by emailing the team."
            : "Sign-in isn't available right now. Please try again later.";
          break;
        case 409:
          message = "An account with this email already exists.";
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

  /* ---------- pointer parallax on the photo (desktop) ---------- */
  const layer = document.querySelector("[data-auth-parallax]");
  if (layer && finePointer && !reduce) {
    const wide = matchMedia("(min-width: 901px)");
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const step = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      layer.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) raf = requestAnimationFrame(step);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    window.addEventListener("pointermove", e => {
      if (!wide.matches) return;
      tx = (e.clientX / innerWidth - 0.5) * -22;
      ty = (e.clientY / innerHeight - 0.5) * -16;
      kick();
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
    wide.addEventListener("change", () => { tx = ty = 0; kick(); });
  }
})();

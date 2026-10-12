/* Shared behaviour for every page: mobile menu, animated accordions,
   footer year, and a light toast helper for demo-only actions. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initMenu() {
    const nav = document.querySelector(".site-nav");
    // The nav slides away while scrolling down; bring it back when keyboard focus enters it.
    if (nav) nav.addEventListener("focusin", () => nav.classList.remove("is-hidden"));
    const btn = nav && nav.querySelector(".site-nav__menu");
    if (!btn) return;
    if (!btn.hasAttribute("aria-controls") && document.getElementById("mobile-menu")) btn.setAttribute("aria-controls", "mobile-menu");
    const close = () => { nav.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", () => {
      const open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      nav.classList.remove("is-hidden");
      btn.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".mobile-menu a").forEach(a => a.addEventListener("click", close));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !nav.classList.contains("is-open")) return;
      // focus inside the menu would be stranded on a hidden link: hand it back to the toggle
      const menu = document.querySelector(".mobile-menu");
      const inside = menu && menu.contains(document.activeElement);
      close();
      if (inside) btn.focus();
    });
  }

  /* <details class="accordion__item"> opens and closes with a height animation */
  function initAccordions() {
    document.querySelectorAll("details[data-accordion]").forEach(d => {
      const summary = d.querySelector("summary");
      const body = d.querySelector("[data-accordion-body]");
      if (!summary || !body) return;
      let anim = null;
      summary.addEventListener("click", e => {
        if (reduce || !body.animate) return;
        e.preventDefault();
        if (anim) anim.cancel();
        if (d.open) {
          const h = body.offsetHeight;
          d.classList.remove("is-open");
          anim = body.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 380, easing: "cubic-bezier(.65,0,.35,1)" });
          anim.onfinish = () => { d.open = false; anim = null; };
        } else {
          d.open = true;
          d.classList.add("is-open");
          const h = body.offsetHeight;
          anim = body.animate([{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" });
          anim.onfinish = () => { anim = null; };
        }
      });
      d.addEventListener("toggle", () => d.classList.toggle("is-open", d.open));
    });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  let toastTimer;
  function toast(message) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 3200);
  }

  function init() {
    initMenu();
    initAccordions();
    initYear();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.Insidir = Object.assign(window.Insidir || {}, { toast });
})();

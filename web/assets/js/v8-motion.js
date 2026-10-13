/* Insidir: gentle progressive reveals. Nothing is hidden if JS or observers fail. */
(() => {
  "use strict";
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const nodes = document.querySelectorAll(
    "[data-ed8-reveal], .v6-section__heading, .v6-story, .v6-benefits__grid>div, .v6-process__row, .v3-quicklinks>a, .v3-module"
  );
  const candidates = [];
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.top > window.innerHeight * .92) {
      node.setAttribute("data-ed8-reveal", "below");
      candidates.push(node);
    }
  }
  if (!candidates.length) return;
  document.documentElement.classList.add("ed8-motion-ready");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.setAttribute("data-ed8-reveal", "visible");
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px 38px 0px", threshold: .04 });
  for (const node of candidates) observer.observe(node);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      for (const node of candidates) {
        if (node.getBoundingClientRect().top < window.innerHeight) node.setAttribute("data-ed8-reveal", "visible");
      }
    }
  });
})();

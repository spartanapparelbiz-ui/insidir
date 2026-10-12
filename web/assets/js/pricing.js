/* Pricing page: a soft spotlight follows the pointer across the plan cards. */
(() => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) return;
  document.querySelectorAll(".pr-card").forEach(card => {
    let frame = 0, x = 0, y = 0;
    const apply = () => {
      frame = 0;
      card.style.setProperty("--mx", x.toFixed(1) + "px");
      card.style.setProperty("--my", y.toFixed(1) + "px");
    };
    card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!frame) frame = requestAnimationFrame(apply);
    });
  });
})();

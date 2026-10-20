/* Insidir landing: the product tour. Four recorded clips beside four numbered steps (tabs).
   - A clip plays, muted, once the tour is on screen, and the next step starts when it ends; the bar
     under the active step shows how far it has played.
   - Choosing a step plays its clip from the start. The button over the clip pauses and resumes; a
     paused tour stays paused until a step or the button is chosen.
   - With reduced motion nothing plays by itself: the clip waits for the play button.
   - Without this script the first clip is a plain <video controls>.
   No data is fetched: the clips are files on this site. */
(() => {
  const root = document.querySelector("[data-tour]");
  if (!root) return;
  const video = root.querySelector("video");
  const steps = [...root.querySelectorAll(".lp-tour__step")];
  const toggle = root.querySelector("[data-tour-toggle]");
  const url = root.querySelector("[data-tour-url]");
  const panel = root.querySelector('[role="tabpanel"]');
  if (!video || !steps.length) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0, visible = false, userPaused = still.matches;

  // Each clip is on the site as H.264 MP4 and VP9 WebM; browsers without H.264 (some open-source builds) get WebM.
  const ext = video.canPlayType('video/mp4; codecs="avc1.4d401f"') ? ".mp4" : ".webm";
  video.querySelectorAll("source").forEach(s => s.remove());
  video.src = steps[0].dataset.video + ext;
  video.controls = false;
  video.loop = false;
  if (toggle) toggle.hidden = false;

  const setToggle = () => {
    if (!toggle) return;
    const paused = video.paused;
    toggle.dataset.state = paused ? "paused" : "playing";
    toggle.setAttribute("aria-label", paused ? "Play" : "Pause");
  };
  const bar = i => steps[i].querySelector(".lp-tour__bar i");
  const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => setToggle()); };

  function select(i, { autoplay = true, focus = false } = {}) {
    index = (i + steps.length) % steps.length;
    steps.forEach((step, n) => {
      const on = n === index;
      step.setAttribute("aria-selected", on ? "true" : "false");
      step.tabIndex = on ? 0 : -1;
      const b = bar(n); if (b) b.style.setProperty("--p", "0");
    });
    const step = steps[index];
    if (focus) step.focus();
    if (panel) panel.setAttribute("aria-labelledby", step.id);
    if (url && step.dataset.url) url.textContent = step.dataset.url;
    const title = step.querySelector(".lp-tour__title");
    if (title) video.setAttribute("aria-label", "Product clip: " + title.textContent.toLowerCase());
    const src = step.dataset.video + ext;
    if (video.getAttribute("src") !== src) {
      video.poster = step.dataset.poster || "";
      video.src = src;
      video.load();
    } else video.currentTime = 0;
    if (autoplay && !userPaused && visible) play();
    setToggle();
  }

  steps.forEach((step, n) => {
    step.addEventListener("click", () => { userPaused = false; select(n); if (!visible) play(); });
    step.addEventListener("keydown", e => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (e.key in keys) { e.preventDefault(); select(index + keys[e.key], { autoplay: !userPaused, focus: true }); }
      else if (e.key === "Home") { e.preventDefault(); select(0, { autoplay: !userPaused, focus: true }); }
      else if (e.key === "End") { e.preventDefault(); select(steps.length - 1, { autoplay: !userPaused, focus: true }); }
    });
  });
  steps.forEach((step, n) => { step.tabIndex = n === 0 ? 0 : -1; });

  if (toggle) toggle.addEventListener("click", () => {
    if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); }
    setToggle();
  });
  video.addEventListener("play", setToggle);
  video.addEventListener("pause", setToggle);
  video.addEventListener("timeupdate", () => {
    const b = bar(index);
    if (b && video.duration) b.style.setProperty("--p", String(Math.min(1, video.currentTime / video.duration)));
  });
  video.addEventListener("ended", () => {
    const b = bar(index); if (b) b.style.setProperty("--p", "1");
    if (!userPaused) select(index + 1);
  });

  // Play only while the tour is on screen; pause when it scrolls away (and resume when it returns).
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      for (const entry of entries) {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (visible && !userPaused) play();
        else if (!visible && !video.paused) video.pause();
      }
    }, { threshold: [0, 0.35, 0.6] }).observe(video);
  } else { visible = true; if (!userPaused) play(); }
  document.addEventListener("visibilitychange", () => { if (document.hidden && !video.paused) video.pause(); else if (!document.hidden && visible && !userPaused) play(); });
  still.addEventListener?.("change", e => { if (e.matches) { userPaused = true; video.pause(); } });
  setToggle();
})();

/* Sharing on Insidir's public research pages, and the creator kit's copy and link tools. No third-party scripts,
 * no cookies, no tracking: nothing here sends anything anywhere.
 *
 *   [data-share-copy]          copy this page's link
 *   [data-share-native]        the device's share sheet (shown only where navigator.share exists)
 *   [data-share-description]   copy a ready-to-paste video description: the title, this page's link, the SEC source
 *   [data-copy-target="id"]    copy the text of element #id (scripts, hooks, disclosure lines)
 *   [data-copy-value="text"]   copy that text (a story link from the creator kit)
 *   [data-link-builder]        the creator kit's tracked-link builder
 *
 * Referral codes: a link keeps the ?ref= it arrived with when the code has the approved shape (the same pattern as
 * src/creator-program.mjs and referral.js); nothing is invented, and a code stored from an earlier visit is never
 * added to a link someone else will open. Whether a code is approved is decided by the server at registration. */
(() => {
  "use strict";
  const CODE = /^[a-z0-9][a-z0-9_-]{2,39}$/;
  const urlRef = () => {
    const raw = new URLSearchParams(location.search).get("ref");
    const code = raw ? raw.trim().toLowerCase() : "";
    return CODE.test(code) ? code : "";
  };
  const canonical = () => document.querySelector('link[rel="canonical"]')?.href || location.origin + location.pathname;
  const withRef = (href, ref = urlRef()) => {
    const u = new URL(href, location.origin);
    if (ref) u.searchParams.set("ref", ref);
    return u.toString();
  };

  // Plain clipboard where allowed, a hidden textarea where not; false if neither worked.
  async function copy(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
    const area = document.createElement("textarea");
    area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.top = "-1000px"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); }
  }
  const timers = new WeakMap();
  function say(from, text, tone = "") {
    const scope = from.closest("[data-share-scope]") || document;
    const status = scope.querySelector("[data-share-status]");
    if (!status) return;
    status.textContent = text;
    if (tone) status.dataset.tone = tone; else delete status.dataset.tone;
    clearTimeout(timers.get(status));
    timers.set(status, setTimeout(() => { status.textContent = ""; delete status.dataset.tone; }, 6000));
  }
  // When copying is refused, show the text in a selected field so it can be copied by hand.
  function fallback(from, text) {
    const scope = from.closest("[data-share-scope]") || document;
    const field = scope.querySelector("[data-share-fallback]");
    say(from, "Copying is blocked in this browser. The text is selected below: copy it from there.", "error");
    if (!field) return;
    field.hidden = false; field.value = text; field.focus(); field.select();
  }
  async function copyAndSay(from, text, done) {
    if (await copy(text)) say(from, done); else fallback(from, text);
  }

  const descriptionText = button => {
    const title = button.dataset.title || document.title;
    const source = button.dataset.source || "";
    return [title, "Read the research: " + withRef(canonical()), source ? "Original SEC filing: " + source : "", "Public SEC records. Not investment advice."].filter(Boolean).join("\n");
  };

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-share-copy],[data-share-native],[data-share-description],[data-copy-target],[data-copy-value]");
    if (!button) return;
    event.preventDefault();
    if (button.hasAttribute("data-share-copy")) return copyAndSay(button, withRef(canonical()), "Link copied.");
    if (button.hasAttribute("data-share-description")) return copyAndSay(button, descriptionText(button), "Description copied: title, link and the SEC source.");
    if (button.hasAttribute("data-copy-value")) return copyAndSay(button, withRef(button.dataset.copyValue), button.dataset.copied || "Link copied.");
    if (button.hasAttribute("data-copy-target")) {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      return copyAndSay(button, target.innerText.trim(), button.dataset.copied || "Copied.");
    }
    if (button.hasAttribute("data-share-native") && navigator.share) {
      try { await navigator.share({ title: button.dataset.title || document.title, url: withRef(canonical()) }); say(button, "Shared."); }
      catch (error) { if (error?.name !== "AbortError") copyAndSay(button, withRef(canonical()), "Sharing isn't available here, so the link was copied."); }
    }
  });

  // The share sheet is offered only where the device has one.
  if (navigator.share) for (const b of document.querySelectorAll("[data-share-native]")) b.hidden = false;

  // A visitor who arrived with an approved-shape code keeps it on the way to sign-up (referral.js has stored it too).
  const ref = urlRef();
  if (ref) for (const a of document.querySelectorAll('a[href^="/signup.html"],a[href^="signup.html"],a[data-keep-ref]')) a.href = withRef(a.getAttribute("href"), ref);

  /* The tracked-link builder: a page from the list plus the creator's own approved code. */
  const builder = document.querySelector("[data-link-builder]");
  if (builder) {
    const page = builder.querySelector("[data-lb-page]"), code = builder.querySelector("[data-lb-code]");
    const output = builder.querySelector("[data-lb-output]"), help = builder.querySelector("[data-lb-help]"), copyBtn = builder.querySelector("[data-lb-copy]");
    const helpText = help ? help.textContent : "";
    const wanted = new URLSearchParams(location.search).get("page");
    if (wanted && [...page.options].some(o => o.value === wanted)) page.value = wanted;
    const refresh = () => {
      const value = code.value.trim().toLowerCase().replace(/^@/, "");
      const valid = CODE.test(value);
      code.setAttribute("aria-invalid", value && !valid ? "true" : "false");
      if (help) {
        help.textContent = value && !valid ? "Codes are 3 to 40 characters: lowercase letters, numbers, - or _, starting with a letter or number." : helpText;
        if (value && !valid) help.dataset.tone = "error"; else delete help.dataset.tone;
      }
      const link = new URL(page.value, builder.dataset.origin || location.origin);
      if (valid) link.searchParams.set("ref", value);
      output.value = output.textContent = valid ? link.toString() : "Enter your approved code to build your link.";
      copyBtn.disabled = !valid;
    };
    builder.addEventListener("submit", e => e.preventDefault());
    page.addEventListener("change", refresh); code.addEventListener("input", refresh);
    copyBtn.addEventListener("click", () => { if (!copyBtn.disabled) copyAndSay(copyBtn, output.value, "Your link is copied. It only credits you if Insidir has approved your code."); });
    refresh();
  }
})();

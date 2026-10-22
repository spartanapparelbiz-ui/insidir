/* Insidir product analytics through PostHog (US cloud). privacy.html sections 2 and 4 describe this; keep them in step.
   Off entirely when: the browser sends Global Privacy Control or Do Not Track, the page is a sign-in, account, billing,
   portfolio or admin page, the site runs on this machine (development and tests), or no project token is set.
   What is sent: page views, page leaves and clicks, with the page address cut to its path (no query string or fragment,
   so no search text), element text and attributes masked, no typed input, no session recording and no surveys.
   A random PostHog id is kept in localStorage, never in a cookie, and is not linked to the account. */
(() => {
  "use strict";
  const TOKEN = "";
  const API_HOST = "https://us.i.posthog.com";
  const LOADER = "https://us-assets.i.posthog.com/static/array.js";
  const PRIVATE = /^\/(signin|forgot-password|reset-password|verify-email|account|account-deleted|billing|portfolio|ops|admin-[a-z-]+)(\.html)?$/;

  if (!TOKEN) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  if (PRIVATE.test(location.pathname)) return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;

  /* An address on this site keeps its path only; another site's address keeps its origin only (as funnel.js does).
     PostHog's own markers such as "$direct" are not addresses and pass through. */
  function trim(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return value;
    try {
      const u = new URL(value);
      return u.host === location.host ? u.origin + u.pathname : u.origin + "/";
    } catch (e) { return undefined; }
  }
  const URL_KEYS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url", "$session_entry_referrer"];
  function scrub(props) {
    if (!props || typeof props !== "object") return;
    for (const key of URL_KEYS) if (key in props) props[key] = trim(props[key]);
    if (typeof props.$elements_chain === "string") props.$elements_chain = props.$elements_chain.replace(/([?#])[^"]*/g, "");
  }

  const options = {
    api_host: API_HOST,
    persistence: "localStorage",
    person_profiles: "identified_only",
    respect_dnt: true,
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    before_send: event => {
      if (!event) return event;
      scrub(event.properties);
      scrub(event.$set);
      scrub(event.$set_once);
      return event;
    }
  };
  /* The queue PostHog's own snippet leaves for its loader, which initialises from it once it arrives. */
  const queue = [];
  queue._i = [[TOKEN, options, "posthog"]];
  queue.people = [];
  window.posthog = queue;
  /* The loader starts sending only once it sees the document finished: either already "complete" or a DOMContentLoaded
     still to come. Injected from a deferred script it would arrive between the two and wait forever, so it is added
     after the window's load event. */
  function inject() {
    const script = document.createElement("script");
    script.async = true;
    script.src = LOADER;
    document.head.appendChild(script);
  }
  if (document.readyState === "complete") inject();
  else window.addEventListener("load", inject, { once: true });
})();

/* Account pages in the app shell (account.html, billing.html) must stay open to a member without an active
   subscription: that is where a lapsed, past-due or cancelled member fixes billing, downloads their data or deletes
   the account. The shell (ui.js) asks GET /v1/me/notifications for the unread badge through InsidirUI.api(), which
   sends any 402 to subscribe.html, so a lapsed member would be bounced off these pages. Loaded before ui.js, this
   answers that one background request's 402 with an empty inbox instead. Nothing else is touched.
   Remove this file once ui.js asks for the unread count without the 402 redirect. */
(() => {
  "use strict";
  const real = window.fetch && window.fetch.bind(window);
  if (!real) return;
  const UNREAD = /^\/v1\/me\/notifications$/;
  window.fetch = async (input, init) => {
    const res = await real(input, init);
    if (res.status !== 402) return res;
    let path = "";
    try { path = new URL(typeof input === "string" ? input : input.url, location.href).pathname; } catch { return res; }
    if (!UNREAD.test(path)) return res;
    return new Response('{"items":[],"unread":0,"next":null}', { status: 200, headers: { "Content-Type": "application/json" } });
  };
})();

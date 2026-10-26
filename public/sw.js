/* Insidir service worker: makes the site installable (PWA), shows a small offline page when a navigation fails,
 * and handles web push alerts. Nothing else is cached: prices must always come from the network.
 *
 * Push payload (JSON): { "title": "...", "body": "...", "url": "/deal/<id>?from=alert&opp=<id>", "tag"?: "..." }
 * The url already carries ?from=alert&opp=…, so opening it is all a click needs to do. */
const VERSION = "insidir-sw-1";
const OFFLINE_URL = "/__offline";
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline | Insidir</title><style>html,body{margin:0;background:#000;color:#f2f0ea;font:15px/1.55 "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace}
main{max-width:520px;margin:0 auto;padding:64px 16px;display:grid;gap:16px}h1{font-size:28px;margin:0}p{margin:0;color:#8e8c86}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;background:#f2f0ea;color:#000;font-weight:700;text-decoration:none;width:max-content}</style></head>
<body><main><h1>You're offline</h1><p>Insidir needs a connection to show prices. Nothing on this page is live.</p><a href="/terminal">Try again</a></main></body></html>`;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.put(OFFLINE_URL, new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then(r => r || Response.error())));
});

/** Only same-site paths are opened from a notification. */
function safeUrl(raw) {
  try {
    const u = new URL(typeof raw === "string" && raw ? raw : "/terminal", self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL("/terminal", self.location.origin).href;
  } catch {
    return new URL("/terminal", self.location.origin).href;
  }
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : "Insidir";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: safeUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});

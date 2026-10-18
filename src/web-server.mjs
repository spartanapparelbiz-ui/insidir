import { createServer } from "node:http";
import { serveStatic } from "./web.mjs";
import { handleCompanyRoute } from "./company-routes.mjs";
import { handlePublicPage } from "./public-pages.mjs";

// Website-only preview: serves /web without a database. The public company report
// endpoints (SEC, market and profile data) work when SEC_USER_AGENT is set; account
// API calls fail gracefully.
const port = Number(process.env.PORT || 5173);
const reply = (res, status, error) => {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error }));
};
createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/v1/")) {
    handleCompanyRoute(req, res, url).then(done => {
      if (done === false) reply(res, 404, "This endpoint needs the full engine (npm start)");
    }).catch(error => {
      const status = Number(error?.status) || 500;
      if (status >= 500 && status !== 503) console.error("API error", error);
      reply(res, status, status >= 500 && status !== 503 ? "Internal error" : String(error?.message || "Bad request"));
    });
    return;
  }
  // Without a database only robots.txt of the public pages can be served; the rest need the engine.
  handlePublicPage(req, res, url).then(done => done || serveStatic(req, res)).then(done => {
    if (!done) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found"); }
  }).catch(error => {
    console.error("Static error", error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal error");
  });
}).listen(port, "0.0.0.0", () => console.log(`Insidir website preview on http://localhost:${port}`));

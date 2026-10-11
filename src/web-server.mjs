import { createServer } from "node:http";
import { serveStatic } from "./web.mjs";

// Website-only preview: serves /web without a database. API calls from the
// pages fail gracefully and the UI falls back to its sample data.
const port = Number(process.env.PORT || 5173);
createServer((req, res) => {
  serveStatic(req, res).then(done => {
    if (!done) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found"); }
  }).catch(error => {
    console.error("Static error", error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal error");
  });
}).listen(port, "0.0.0.0", () => console.log(`Insidir website preview on http://localhost:${port}`));

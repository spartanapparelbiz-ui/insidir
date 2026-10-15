// Read-only static server for the repository's ../web folder, used only to photograph
// the real Insidir pages. It never writes anything and answers every /v1 API call with
// 404, the same as the website preview does without the engine.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = fileURLToPath(new URL("../../../web/", import.meta.url));

const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

async function resolveFile(pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  if (rel === "" || rel.endsWith(sep) || rel.endsWith("/")) rel = join(rel, "index.html");
  const full = join(webRoot, rel);
  if (!full.startsWith(webRoot)) return null;
  for (const candidate of extname(full) ? [full] : [full, full + ".html", join(full, "index.html")]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* next */ }
  }
  return null;
}

export function startSiteServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname.startsWith("/v1/")) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "No engine in the video capture server" }));
      return;
    }
    const file = await resolveFile(url.pathname).catch(() => null);
    if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise(done => server.close(done)) });
  }));
}

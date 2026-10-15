// Renders transparent 1920x1080 type plates with the repo's own JetBrains Mono (web/assets/fonts),
// styled like the site: lowercase 800 wordmark at -.04em, tracked uppercase micro-labels.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const fontDir = new URL("../../web/assets/fonts/", import.meta.url);
const specs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const fontB64 = readFileSync(new URL("JetBrainsMono-normal-latin.woff2", fontDir)).toString("base64");
const ff = `@font-face{font-family:JBM;font-weight:100 800;src:url(data:font/woff2;base64,${fontB64}) format("woff2")}`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const s of specs) {
  const html = `<html><head><style>${ff}
  html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden}
  body{display:flex;flex-direction:column;align-items:center;justify-content:${s.justify||"center"};font-family:JBM;color:#e9e4da}
  .wm{font-weight:800;letter-spacing:-.04em;line-height:1;font-size:${s.size||200}px}
  .cap{font-weight:${s.weight||600};text-transform:uppercase;letter-spacing:${s.tracking||".32em"};font-size:${s.size||34}px;text-align:center;line-height:1.4;padding:${s.pad||"0"};margin-right:-${s.tracking||".32em"}}
  .sub{margin-top:${s.gap||46}px;font-weight:500;text-transform:uppercase;letter-spacing:.42em;font-size:${s.subSize||20}px;opacity:.86;margin-right:-.42em}
  </style></head><body>${s.html}</body></html>`;
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: s.out, omitBackground: true });
  console.log("ok", s.out);
}
await browser.close();

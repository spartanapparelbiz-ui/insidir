// Renders the SEC's own HTML view of the Form 4 (saved from sec.gov) at high resolution.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(process.argv[2]).href, { waitUntil: "load" });
await page.addStyleTag({ content: "html,body{background:#fff}" });
await page.screenshot({ path: process.argv[3], fullPage: true });
await browser.close();

// Captures real Insidir product screens from the local preview server (real SEC/market data).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = process.argv[2] || "http://localhost:5199";
const out = process.argv[3] || "films/product2x";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" + "" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const shots = [
  ["company_nvda", "/company.html?ticker=NVDA", []],
  ["company_nvda_filings", "/company.html?ticker=NVDA", ["SEC filings"]],
  ["company_nvda_insiders", "/company.html?ticker=NVDA", ["Insider activity"]],
  
  
];
for (const [name, path, clicks] of shots) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 }).catch(e => console.log("nav", name, e.message));
  await page.waitForTimeout(6000);
  for (const c of clicks) { await page.getByRole("tab", { name: c }).first().click().catch(async () => page.getByText(c, { exact: true }).first().click().catch(e => console.log("click", c, e.message))); await page.waitForTimeout(8000); }
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.screenshot({ path: `${out}/${name}_full.png`, fullPage: true });
  console.log("ok", name);
}
await browser.close();

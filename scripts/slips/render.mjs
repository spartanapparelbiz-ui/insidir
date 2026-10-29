/* Renders the ten test slips (scripts/slips/fixtures.ts) to PNG screenshots in test/fixtures/slips, phone-sized like a
 * real screenshot. Made-up slips in each book's general layout: text only, no logos, no real accounts.
 *   npx tsx scripts/slips/render.mjs */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { SLIPS } from "./fixtures.ts";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const OUT = "test/fixtures/slips";
mkdirSync(OUT, { recursive: true });

function html(s) {
  const dark = s.layout === "contract" || /DraftKings|bet365|Fanatics/.test(s.book);
  const bg = dark ? "#16181d" : "#ffffff", fg = dark ? "#f2f3f5" : "#121417", sub = dark ? "#9aa0a8" : "#5f6670", card = dark ? "#22252c" : "#f1f3f6";
  const rows = s.lines.map(l => `
    <div class="leg">
      <div class="top"><b>${esc(l.pick)}</b><span class="odds">${esc(l.odds)}</span></div>
      <div class="m">${esc(l.market)}</div>
      <div class="e">${esc(l.event)}${l.when ? ` · ${esc(l.when)}` : ""}</div>
    </div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:${bg};color:${fg};font:16px/1.35 -apple-system,Helvetica,Arial,sans-serif;width:390px}
    .bar{display:flex;justify-content:space-between;padding:14px 20px;font-size:14px;color:${sub}}
    .book{padding:4px 20px 0;font-size:22px;font-weight:800;letter-spacing:-.02em}
    .title{padding:2px 20px 14px;color:${sub};font-size:14px}
    .leg{margin:0 16px 10px;padding:14px 16px;border-radius:14px;background:${card}}
    .top{display:flex;justify-content:space-between;gap:12px;font-size:17px}.odds{font-weight:700}
    .m{margin-top:4px;font-size:14px}.e{margin-top:2px;font-size:13px;color:${sub}}
    .tot{margin:14px 16px;display:flex;justify-content:space-between;font-size:15px}.tot b{font-size:18px}
    .acct{margin:18px 20px;font-size:12px;color:${sub}}
  </style>
  <div class="bar"><span>9:41</span><span>●●● 5G</span></div>
  <div class="book">${esc(s.book)}</div><div class="title">${esc(s.title)}</div>
  ${rows}
  <div class="tot"><span>${s.layout === "contract" ? "Cost" : "Wager"} <b>${esc(s.wager)}</b></span><span>${s.layout === "contract" ? "Pays if right" : "To pay"} <b>${esc(s.payout)}</b></span></div>
  <div class="acct">Bet ID 0000-TEST · Account ••••0000</div>`;
}

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const p = await b.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
for (const s of SLIPS) {
  await p.setContent(html(s));
  await p.screenshot({ path: `${OUT}/${s.file}`, fullPage: true });
  console.log(s.file);
}
await b.close();

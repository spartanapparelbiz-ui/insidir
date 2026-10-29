import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const PAGES = ["/", "/trackers", "/trackers/biggest-bets", "/feed", "/results", "/top", "/following", "/pricing", "/how-it-works", "/faq", "/sports", "/markets", "/stocks", "/market/0xe2emarket1", "/insider-trading/EXDV", "/data", "/alerts", "/settings", "/login", "/not-a-page"];
for (const who of ["visitor", "member"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: "e2e-insidir-session-token-00000000000000", url: "http://localhost:3100" }]);
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => [...document.images].map(i => { const s = getComputedStyle(i), box = i.getBoundingClientRect(); let vis = box.width > 2 && box.height > 2; for (let e = i; e && vis; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden" || Number(c.opacity) < 0.05) vis = false; } return { src: (i.currentSrc || i.src).replace(location.origin, ""), vis, ok: i.complete && i.naturalWidth > 0, w: Math.round(box.width), h: Math.round(box.height) }; }).filter(x => x.vis));
    console.log(who, path, JSON.stringify(r.map(x => `${x.src.split("/").pop()} ${x.w}x${x.h}${x.ok ? "" : " BROKEN"}`)));
  }
  await ctx.close();
}
await b.close();

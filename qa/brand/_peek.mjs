import { chromium } from "playwright";
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const tok = "audit-dev-session-token-000000000000000001";
for (const [name, path, member, w] of [["full", "/", false, 1280], ["go-paywall", "/go?step=paywall", false, 1280], ["home", "/", true, 1440], ["home-board", "/?tab=board", true, 1440]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: base }, ...(member ? [{ name: "insidir_session", value: tok, url: base }] : [])]);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  await p.goto(base + path, { waitUntil: "load" }); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/peek-${name}.jpg`, fullPage: true, type: "jpeg", quality: 60 });
  console.log(name, errs);
  await ctx.close();
}
await b.close();

// Copy audit of the built site: every public and app page, as a visitor and as a member, at 1440 wide. Reads the
// visible text (innerText, so only what a person sees, plus titles and meta descriptions) and fails on any old term
// the house style retired (docs/INSIDIR-V2.md §4). Then screenshots home, a tracker, Activity, Track record and a
// market page at 1440 and 390 into qa/screenshots/copy/.
// Run against a started build (qa/e2e/run.sh's app with the e2e database): node qa/copy-audit.mjs http://localhost:3100
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MEMBER = "e2e-insidir-session-token-00000000000000";
const PAGES = ["/", "/trackers", "/trackers/biggest-bets", "/trackers/nfl-big-money", "/trackers/ceo-buys", "/feed", "/results", "/splits", "/splits/scorecard",
  "/pricing", "/faq", "/how-it-works", "/about", "/data", "/sports", "/markets", "/stocks", "/market/0xe2emarket1", "/top", "/following", "/check",
  "/insider-trading/EXDV", "/terms", "/privacy", "/login", "/start", "/alerts", "/settings", "/not-a-page"];
// The retired wording. "big money" is allowed only in the H1 "Follow the big money." and the home section title.
const OLD = [
  [/\bbig moves?\b/i, "big move"], [/\bbig money\b/i, "big money"], [/\bbets?\b/i, "bet"], [/\bwagers?\b/i, "wager"], [/\bSomeone\b/, "Someone"],
  [/\bbrand-new wallet/i, "brand-new wallet"], [/\ba top trader\b/i, "a top trader"], [/\bchance\b/i, "chance"], [/\bIn at \d/, "In at"],
  [/\bPays \$/, "Pays $"], [/\bsold (early|before the result)\b/i, "sold early"], [/\brefunded\b/i, "refunded"], [/\btracked in 30 days\b/i, "tracked in 30 days"],
  [/\bBiggest (bet|win|loss)/, "Biggest"], [/\bAverage bet\b/i, "Average bet"], [/win rate − price/, "win rate − price"], [/\bSplits?\b/, "Splits"],
  [/\bCheck your bet\b/i, "Check your bet"], [/\bFiled today\b/, "Filed today"], [/\bInsider buys?\b/, "Insider buy"], [/\bjust\b/i, "just"],
  [/\b(Underdog Hunters|Favorites Only|Early Money|Late Money|Brand-New Wallets|Big Money|CEO Buys|Cluster Buys|Big Funds)\b/, "old tracker name"],
  [/(^|\n)Steam(\n|$)/, "Steam"], [/(^|\n)(Feed|Results)(\n|$)/, "Feed/Results label"],
];
const ALLOWED = [/Follow the big money\./g, /A live portfolio of big money/g];

const browser = await chromium.launch();
const hits = [];
for (const who of ["visitor", "member"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
    // Open every Details so its text is read too.
    await page.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
    const text = await page.evaluate(() => [document.title, document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "", document.body.innerText].join("\n"));
    let t = text;
    for (const a of ALLOWED) t = t.replace(a, "");
    for (const [re, name] of OLD) {
      const m = t.match(re);
      if (m) {
        const i = t.indexOf(m[0]);
        hits.push(`${who} ${page.url().replace(BASE, "")}: "${name}" in …${t.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ")}…`);
      }
    }
  }
  await ctx.close();
}

// Screenshots: home (visitor), a tracker, Activity, Track record and a market page (member), at 1440 and 390.
mkdirSync("qa/screenshots/copy", { recursive: true });
const SHOTS = [["home", "/", "visitor"], ["tracker", "/trackers/biggest-bets", "member"], ["activity", "/feed", "member"], ["track-record", "/results", "member"], ["market", "/market/0xe2emarket1", "member"], ["app-home", "/", "member"]];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const [name, path, who] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 3 : 1, reducedMotion: "reduce" });
    if (who === "member") await ctx.addCookies([{ name: "insidir_session", value: MEMBER, url: BASE, httpOnly: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
    await page.screenshot({ path: `qa/screenshots/copy/${name}-${w}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();
writeFileSync("qa/screenshots/copy/old-terms.txt", hits.length ? hits.join("\n") + "\n" : "No old terms found.\n");
console.log(hits.length ? hits.join("\n") : "No old terms found.");
process.exit(hits.length ? 1 : 0);

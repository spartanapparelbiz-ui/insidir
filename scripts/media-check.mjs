/* Insidir media check: every person and company on every product page shows a real logo or headshot.

   Opens each page in headless Chromium at 390px (touch) and 1440px with the /v1 API mocked, including
   GET /v1/media with the engine's exact contract (src/media-batch.mjs): logos by ticker or "cik:<CIK>",
   headshots by owner CIK, owners that are entities, `pending` keys and `retryAfter`. The images it serves
   at /v1/media/<sha256>.<ext> are plain grey fixtures (PNG logos, WebP headshots) drawn with sharp inside
   this run only; they are never written to disk or shipped. Wikimedia Commons is mocked with 250px
   thumbnails, so the curated portraits load offline.

   Fixture people (owner CIK -> engine answer): Cook a headshot (SEC proxy), Huang a headshot from Commons,
   Musk a headshot that is pending once, Woods a headshot whose image 404s, Nadella none (the curated Commons
   portrait), Berkshire Hathaway an entity owner listed as BRK-B (its own logo), Nobody none at a company
   with no logo (the only person monogram), Smith at Private Holdings (an issuer with no ticker: his tile
   asks people=<owner>:cik:<issuer>, as the engine takes it, and gets his headshot); everyone else none (the
   company's logo stands in). Companies: logos for every ticker (square, wide-only, square + wide, PLTR
   pending once) except ZZZZ (the only company monogram), plus a company with no ticker found by issuer CIK.
   Tim Cook's personnel file (/person.html?cik=1214156) is served from a /v1/people mock in the
   GET /v1/people/<cik> contract (src/person-profile.mjs), with a joint filing he shares with Adams.

   For every page and width it verifies:
     - every visible tile holds a loaded <img> (complete, naturalWidth > 0) except the two fixture keys that
       have neither a photo nor a logo (.is-monogram), and each tile shows exactly what the fallback chain
       says for its person or company (photo, curated portrait, own logo, stand-in with the issuer's logo src);
     - the picture fills its tile: the <img> box (or the initials' <svg>) equals the tile's content box within
       1px on every page, including those that still load the legacy v5-media.css;
     - loading: exactly one /v1/media request before the first answer, follow-ups only for keys that were
       pending, no /v1/company/logo per tile, no image host but this origin and the curated Commons files;
     - tiles keep their size from first paint to settled, and the layout shift they cause stays under 0.005
       (the page's own shift while its records load is printed as INFO);
     - every picture is at least 2x sharp (natural size against the <img>'s own content box, after
       cover/contain and padding);
     - tiles beside names are aria-hidden with alt="", no link inside a tile and no nested links, and the
       [data-media-credits] footnote lists every Commons photo with its author, licence and file page;
     - every person name links to that person's file: each person tile with an owner CIK has a link to
       person.html?cik=<CIK without leading zeros> beside it, no directory search (people.html?q=) is
       offered for anyone whose CIK is known, and every person.html link carries a real CIK; on the company
       report every insider name and card opens the person's file, a founder who also files Form 4 too
       (leadership card), and every other name opens the directory search for the name as filed; on alerts and
       portfolio a joint line links each owner the engine lists, and with no list each name split from the
       joined owner_name opens the directory search;
     - no page errors and no console errors.
   And once: the batch returning 503 (curated marks and portraits, then initials, no errors), a headshot
   whose image 404s (asked again once, then the company's logo), sessionStorage reuse across pages (tiles
   final at insertion, no new request), reduced motion (no landing animation), a cold logo while a photo job
   waits its turn (retryAfter 15: the logo is asked again on its own 2 s schedule and stands in at once), the
   photo-credits footnote with the reader at the bottom of the page when the pictures arrive (nothing moves;
   the text goes in once the footnote is off screen), an older engine that takes people= as "<owner>:<TICKER>"
   only (the person at an issuer with no ticker then steps down to that issuer's logo, found by CIK), a headshot
   whose company job waits its turn (`queued`: asked again every 15-60 s without using up the six-minute
   schedule, the logo standing in meanwhile, the photo landing once the job has run, and never asked for more
   than about 15 minutes), the company report's photo job waiting its turn ({queued:true}: polled every 15-30 s
   without advancing its schedule, for about 15 minutes at most; run on Playwright's clock), the company picker
   (every popular company's logo from one batch) and the company report (header logo, headshots, logo
   stand-ins, credits).

   Usage: node scripts/media-check.mjs [--pages dashboard,people,explore,...] [--widths 390,1440] [--shots DIR] [--once]
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { serveStatic } from "../src/web.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const PAGES_ALL = ["dashboard", "people", "person", "explore", "filings", "watchlist", "filing", "filing-private", "research", "alerts", "portfolio", "company", "company-picker"];
const PAGES = opt("pages", "").split(",").filter(Boolean).length ? opt("pages", "").split(",").filter(p => PAGES_ALL.includes(p)) : PAGES_ALL;
// The one-off scenarios (503, image 404, cache, reduced motion, landing) run with the full set, or alone with --once --pages none.
const ONCE = !opt("pages", "") || args.includes("--once");
const WIDTHS = opt("widths", "390,1440").split(",").map(Number).filter(Boolean);
const SHOTS = opt("shots", "");
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const passed = [], failed = [];
const check = (ok, label, detail) => { (ok ? passed : failed).push(ok ? label : label + (detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 1500))); return ok; };

/* ---------- fixture images (made here, served from memory, never shipped) ---------- */
const IMAGES = new Map();   // "<sha>.<ext>" -> {type, bytes}
let shade = 70;
async function fixtureImage(w, h, kind) {
  shade = (shade + 23) % 160 + 60;
  const g = shade;
  const svg = kind === "photo"
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="rgb(${g},${g},${g})"/><circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.2}" fill="rgb(${g + 40},${g + 40},${g + 40})"/><rect x="${w * 0.22}" y="${h * 0.66}" width="${w * 0.56}" height="${h * 0.34}" fill="rgb(${g + 40},${g + 40},${g + 40})"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}" fill="none" stroke="rgb(${g},${g},${g})" stroke-width="${Math.min(w, h) * 0.06}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.28}" fill="rgb(${g},${g},${g})"/></svg>`;
  const pipeline = sharp(Buffer.from(svg));
  const bytes = kind === "photo" ? await pipeline.webp({ quality: 80 }).toBuffer() : await pipeline.png().toBuffer();
  const ext = kind === "photo" ? "webp" : "png";
  const sha = createHash("sha256").update(bytes).digest("hex");
  IMAGES.set(sha + "." + ext, { type: kind === "photo" ? "image/webp" : "image/png", bytes });
  return "/v1/media/" + sha + "." + ext;
}
const logoEntry = async (name, w, h, extra = {}) => ({ src: await fixtureImage(w, h, "logo"), w, h, source: "stockanalysis", name, ...extra });
const LOGOS = {
  AAPL: await logoEntry("Apple Inc.", 306, 370, { alt: { src: await fixtureImage(548, 163, "logo"), w: 548, h: 163 } }),
  NVDA: await logoEntry("NVIDIA CORP", 316, 316), MSFT: await logoEntry("MICROSOFT CORP", 316, 316), TSLA: await logoEntry("Tesla, Inc.", 300, 300),
  JPM: await logoEntry("JPMORGAN CHASE & CO", 552, 113), XOM: await logoEntry("EXXON MOBIL CORP", 332, 300), PLTR: await logoEntry("Palantir Technologies Inc.", 280, 332),
  KO: await logoEntry("COCA COLA CO", 314, 121), F: await logoEntry("FORD MOTOR CO", 370, 156), OXY: await logoEntry("OCCIDENTAL PETROLEUM CORP", 300, 300),
  "BRK-B": await logoEntry("BERKSHIRE HATHAWAY INC", 300, 300), ZZZZ: null,
  GOOGL: await logoEntry("Alphabet Inc.", 300, 300), AMZN: await logoEntry("AMAZON COM INC", 520, 160), META: await logoEntry("Meta Platforms, Inc.", 300, 300), AVGO: await logoEntry("Broadcom Inc.", 300, 300),
  NKE: await logoEntry("NIKE, Inc.", 512, 182),
  LLY: await logoEntry("ELI LILLY & Co", 400, 200), V: await logoEntry("VISA INC.", 300, 300), WMT: await logoEntry("Walmart Inc.", 300, 300), NFLX: await logoEntry("NETFLIX INC", 480, 130), COST: await logoEntry("COSTCO WHOLESALE CORP /NEW", 440, 150),
  "cik:1999999": await logoEntry("PRIVATE HOLDINGS CORP", 300, 300)
};
const LOGO_PENDING = { PLTR: 1 };   // answered pending this many times first
const MISSING_PHOTO = "/v1/media/" + "0".repeat(63) + "1.webp";   // a headshot whose bytes are gone (404)
const PHOTOS = {
  "1214156": { src: await fixtureImage(256, 256, "photo"), w: 256, h: 256, source: "sec-proxy", credit: "SEC proxy statement (DEF 14A, filed 2026-01-08)", sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/000130817926000008/aapl4359751-def14a.htm" },
  "1197649": { src: await fixtureImage(256, 256, "photo"), w: 256, h: 256, source: "wikimedia", credit: "Fixture Photographer · CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture_portrait_(cropped).jpg", name: "Jensen Huang" },
  "1494730": { src: await fixtureImage(256, 256, "photo"), w: 256, h: 256, source: "company-site", credit: "Company website (tesla.com)", sourceUrl: "https://www.tesla.com/leadership", name: "Elon Musk" },
  "1408356": { src: MISSING_PHOTO, w: 256, h: 256, source: "company-site", credit: "Company website (exxonmobil.com)", sourceUrl: "https://corporate.exxonmobil.com/" }
};
const PHOTO_PENDING = { "1494730": 1 };
// Answered for people= "<owner>:cik:<issuer>" or "<owner>" (the engine's forms besides "<owner>:<TICKER>").
const PHOTOS_BY_CIK = { "1900001": { src: await fixtureImage(256, 256, "photo"), w: 256, h: 256, source: "sec-proxy", credit: "SEC proxy statement (DEF 14A, filed 2026-03-02)", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1999999/000199999926000002/def14a.htm" } };
const ENTITIES = { "1067983": "BRK-B" };

/* ---------- fixture records ---------- */
const SEC = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
// [ticker, issuer, issuer CIK, [[owner as filed, owner CIK, price]]]
const CO = [
  ["AAPL", "Apple Inc.", "320193", [["COOK TIMOTHY D", "0001214156", 226.4], ["ADAMS KATHERINE L", "0001408568", 226.4]]],
  ["NVDA", "NVIDIA CORP", "1045810", [["HUANG JEN HSUN", "0001197649", 131.25], ["KRESS COLETTE", "0001580197", 130.8]]],
  ["MSFT", "MICROSOFT CORP", "789019", [["NADELLA SATYA", "0001513142", 412.1]]],
  ["TSLA", "Tesla, Inc.", "1318605", [["MUSK ELON", "0001494730", 249], ["KIRKHORN ZACHARY", "0001771364", 251.2]]],
  ["JPM", "JPMORGAN CHASE & CO", "19617", [["DIMON JAMES", "0001195345", 201.5]]],
  ["XOM", "EXXON MOBIL CORP", "34088", [["WOODS DARREN W", "0001408356", 112.3]]],
  ["PLTR", "Palantir Technologies Inc.", "1321655", [["KARP ALEXANDER C", "0001823466", 38.71]]],
  ["KO", "COCA COLA CO", "21344", [["QUINCEY JAMES", "0001257950", 62.18]]],
  ["F", "FORD MOTOR CO", "37996", [["FARLEY JAMES D JR", "0001461290", 10.42]]],
  ["OXY", "OCCIDENTAL PETROLEUM CORP", "797468", [["BERKSHIRE HATHAWAY INC", "0001067983", 58.1]]],
  ["ZZZZ", "NO LOGO HOLDINGS INC", "1999998", [["NOBODY PATRICIA Q", "0009999991", 12.5]]]
];
const tx = [];
let n = 0;
for (const [ticker, issuer, issuerCik, owners] of CO) for (const [owner, cik, price] of owners) for (let k = 0; k < 2; k++) {
  const day = new Date(Date.UTC(2026, 9, 12) - (n % 13) * 86400000).toISOString().slice(0, 10);
  const cat = n % 3 === 0 ? "reported_purchase" : n % 5 === 4 ? "other" : "reported_sale";
  const shares = [1200, 5000, 25000, 800, 150000, 3300, 40000, 12500][n % 8];
  tx.push({ id: 1000 + n, accession: String(320193260000500 + n).padStart(18, "0"), ticker, issuer_name: issuer, issuer_cik: issuerCik, owner_name: owner, owner_cik: cik,
    transaction_date: day, transaction_code: cat === "reported_purchase" ? "P" : cat === "reported_sale" ? "S" : "A", acquired_disposed: cat === "reported_sale" ? "D" : "A",
    category: cat, derivative: false, shares, price_per_share: cat === "other" ? null : price, estimated_value: cat === "other" ? null : Math.round(shares * price * 100) / 100,
    direct_ownership: "D", security_title: "Common Stock", published_at: day + "T21:00:00Z", created_at: day + "T21:05:00Z", is_amendment: false, source_url: SEC });
  n++;
}
tx.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || a.id - b.id);
const filings = [...new Map(tx.map(x => [x.ticker, x])).values()].map(x => ({ accession: x.accession, ticker: x.ticker, issuer_name: x.issuer_name, issuer_cik: x.issuer_cik, form_type: "4",
  published_at: x.published_at, period_of_report: x.transaction_date, source_url: SEC, is_amendment: false, owner_names: [x.owner_name] }));
const PRIVATE = { accession: "000199999926000001", ticker: null, issuer_name: "PRIVATE HOLDINGS CORP", issuer_cik: "1999999", form_type: "4", published_at: "2026-10-01T20:00:00Z", period_of_report: "2026-09-30", source_url: SEC, is_amendment: false, owner_names: ["SMITH JOHN"] };
filings.push(PRIVATE);
// The no-ticker filing's one reporting person (an issuer the SEC lists without a ticker).
const PRIVATE_TX = [{ id: 9001, accession: PRIVATE.accession, ticker: null, issuer_name: PRIVATE.issuer_name, issuer_cik: "1999999", owner_name: "SMITH JOHN", owner_cik: "0001900001", transaction_date: "2026-09-30",
  transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", derivative: false, shares: 4000, price_per_share: 25, estimated_value: 100000, direct_ownership: "D", security_title: "Common Stock",
  published_at: PRIVATE.published_at, created_at: PRIVATE.published_at, is_amendment: false, source_url: SEC }];
const companies = [...CO.map(([ticker, issuer_name, issuer_cik]) => ({ ticker, issuer_name, issuer_cik, published_at: "2026-10-10T20:00:00Z" })), { ticker: null, issuer_name: "PRIVATE HOLDINGS CORP", issuer_cik: "1999999", published_at: "2026-10-01T20:00:00Z" }];
const people = [...new Map(tx.map(x => [x.owner_cik, { owner_name: x.owner_name, owner_cik: x.owner_cik, ticker: x.ticker, issuer_name: x.issuer_name, filings: 2, last_transaction_date: x.transaction_date }])).values()];
const FOLLOW = ["0001214156", "0001197649", "0001494730", "0001195345", "0001408356", "0001067983", "0009999991"];
const followed = tx.filter(x => FOLLOW.includes(x.owner_cik));
const updates = {
  people: FOLLOW.map(cik => { const rows = followed.filter(x => x.owner_cik === cik), last = rows[0];
    return { owner_cik: cik, owner_name: last.owner_name, followed_at: "2026-09-01T00:00:00Z", ticker: last.ticker, issuer_name: last.issuer_name, last_published_at: last.published_at, last_transaction_date: last.transaction_date, last,
      filings_30d: rows.length, transactions_30d: rows.length, purchases_30d_value: rows.filter(x => x.category === "reported_purchase").reduce((s, x) => s + (x.estimated_value || 0), 0),
      sales_30d_value: rows.filter(x => x.category === "reported_sale").reduce((s, x) => s + (x.estimated_value || 0), 0) }; }),
  items: followed.slice(0, 40), following: FOLLOW.length, source: "SEC Form 4"
};
const pick = (...ciks) => tx.filter(x => ciks.includes(x.owner_cik));
// AAPL also lists one filer with no owner CIK on record: only the directory search can look for them.
const NO_CIK = { owner_name: "DOE JANE Q", owner_cik: null };
const insidersFor = t => {
  const rows = tx.filter(x => x.ticker === t);
  if (t === "AAPL") rows.push({ ...rows[0], ...NO_CIK, id: 9201, accession: "000032019326000991" });
  return { company: { cik: rows[0]?.issuer_cik, name: rows[0]?.issuer_name }, activity: rows.map(r => ({ accession: r.accession, form: "4", filedAt: r.published_at.slice(0, 10), transactionDate: r.transaction_date,
    owner: { name: r.owner_name, cik: r.owner_cik, role: "Officer" }, kind: r.category === "reported_purchase" ? "purchase" : r.category === "reported_sale" ? "sale" : "other", code: r.transaction_code,
    codeLabel: r.category === "reported_purchase" ? "Open-market purchase" : r.category === "reported_sale" ? "Open-market sale" : "Grant or award", netShares: r.acquired_disposed === "D" ? -r.shares : r.shares,
    value: r.estimated_value, sharesAfter: 100000, transactions: [], sourceUrl: SEC })),
  people: [...new Map(rows.map(r => [r.owner_cik || r.owner_name, { name: r.owner_name, cik: r.owner_cik, role: "Officer", filings: 2, lastFiled: r.published_at.slice(0, 10), sharesAfter: 100000 }])).values()] };
};
/* Joint filings in the member feeds (alerts, brokerage activity, manual holdings): one whose owners the engine lists
   (owner_cik null, owners:[{cik,name}]: each owner linked to their file, the tile on the first with a CIK), and one
   imported before the owners were recorded (no list: its joined names split on the commas, a ", Jr." kept on the name
   before it, each opening the directory search). */
const JOINT_OWNERS = { owner_cik: null, owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L", owners: [{ cik: "0001214156", name: "COOK TIMOTHY D" }, { cik: "0001408568", name: "ADAMS KATHERINE L" }] };
const JOINT_NAMES = { owner_cik: null, owner_name: "ROE RICHARD, ROE MARY, JR." };
const feedRow = (x, extra = {}) => ({ id: x.id, ticker: x.ticker, issuer_cik: x.issuer_cik, owner_cik: x.owner_cik, owner_name: x.owner_name, transaction_date: x.transaction_date, category: x.category,
  estimated_value: x.estimated_value, source_url: SEC, published_at: x.published_at, ...extra });
const firstOf = t => tx.find(x => x.ticker === t);
const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true } };
const DATA = {
  "/v1/me": me, "/v1/billing/status": { billingEnabled: true, plan: "pro", subscriptionStatus: "active" },
  "/v1/status": { engine: "online", sec: "configured", filings: 18342, lastIngest: { started_at: "2026-10-14T09:00:00Z", finished_at: "2026-10-14T09:12:00Z", status: "success" } },
  "/v1/transactions": { items: tx }, "/v1/filings": { items: filings }, "/v1/companies": { items: companies },
  "/v1/me/watchlist": { items: ["NVDA", "AAPL", "PLTR", "F", "XOM", "ZZZZ"].map((t, i) => ({ ticker: t, created_at: "2026-09-0" + (i + 1) + "T00:00:00Z" })) },
  "/v1/me/research-decisions": { items: [{ ticker: "NVDA", review_status: "researching", notes: "Reading the 10-Q.", updated_at: "2026-10-12T00:00:00Z" }, { ticker: "F", review_status: "watching", notes: "CEO bought.", updated_at: "2026-10-09T00:00:00Z" }] },
  "/v1/insiders": { items: people }, "/v1/me/people": { items: updates.people.map(p => ({ owner_cik: p.owner_cik, created_at: p.followed_at, owner_name: p.owner_name, ticker: p.ticker, last_transaction_date: p.last_transaction_date })) },
  "/v1/me/people/updates": updates, "/v1/search": { items: [] },
  "/v1/me/alerts": { items: [...pick("0001214156", "0001580197", "0001408356", "0001067983", "0009999991", "0001494730").map(x => feedRow(x)),
    feedRow(firstOf("AAPL"), { ...JOINT_OWNERS, id: 9301 }), feedRow(firstOf("KO"), { ...JOINT_NAMES, id: 9302 })] },
  "/v1/me/brokerage/status": { available: true, connected: true },
  "/v1/me/brokerage/portfolio": { accounts: [{ name: "Individual brokerage", maskedNumber: "••••4821", positionsAsOf: "2026-10-14T13:00:00Z", netValue: 48210.55, currency: "USD", positions: [
    { symbol: "AAPL", description: "Apple Inc", kind: "equity", quantity: 40, price: 226.4, currency: "USD", researchTicker: "AAPL" },
    { symbol: "F", description: "Ford Motor Co", kind: "equity", quantity: 300, price: 10.42, currency: "USD", researchTicker: "F" },
    { symbol: "VTI", description: "Vanguard Total Stock Market ETF", kind: "etf", quantity: 12, price: 291.1, currency: "USD", researchTicker: null }] }],
    recentSecActivity: [...pick("0001214156", "0001461290").map(x => ({ ticker: x.ticker, category: x.category, owner_name: x.owner_name, owner_cik: x.owner_cik, published_at: x.published_at, source_url: SEC })),
      { ticker: "AAPL", category: "other", ...JOINT_OWNERS, published_at: firstOf("AAPL").published_at, source_url: SEC }] },
  "/v1/me/manual-holdings": { items: [{ ticker: "NVDA", quantity: "5", updated_at: "2026-10-01T00:00:00Z" }, { ticker: "KO", quantity: "12.5", updated_at: "2026-10-02T00:00:00Z" }],
    recentSecActivity: [...pick("0001580197", "0001257950").map(x => ({ ticker: x.ticker, category: x.category, owner_name: x.owner_name, owner_cik: x.owner_cik, published_at: x.published_at, source_url: SEC })),
      { ticker: "KO", issuer_cik: "21344", category: "reported_sale", ...JOINT_NAMES, published_at: firstOf("KO").published_at, source_url: SEC }] },
  "/v1/intelligence": { company: { name: "Apple Inc.", cik: "0000320193" }, profile: { exchange: "Nasdaq" }, filings: [], facts: [], brief: { summary: "Fixture summary.", findings: [], caveats: [] }, warnings: [] },
  "/v1/company/profile": { matched: false }, "/v1/company/news": { announcements: [], headlines: [] }
};
const FILING = filings.find(f => f.ticker === "AAPL");
// The AAPL filing also carries a joint line (owner_cik null): each reporting owner the engine lists is linked to their file.
const JOINT_LINE = { ...tx.find(x => x.ticker === "AAPL"), id: 9103, owner_cik: null, owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L",
  owners: [{ cik: "0001214156", name: "COOK TIMOTHY D" }, { cik: "0001408568", name: "ADAMS KATHERINE L" }], category: "other", transaction_code: "G", estimated_value: null };
DATA["/v1/filings/" + FILING.accession] = { filing: FILING, transactions: [...tx.filter(x => x.ticker === "AAPL"), JOINT_LINE] };
DATA["/v1/filings/" + PRIVATE.accession] = { filing: PRIVATE, transactions: PRIVATE_TX };
/* Tim Cook's personnel file, in the GET /v1/people/<cik> contract (src/person-profile.mjs; built like
   node_modules/.audit/person/fixtures.mjs): his AAPL lines above, a Nike purchase, and a joint filing he shares with
   Adams (owner_cik null, owners listed), whose co-owner the activity log links to her own file. NUMERIC columns
   arrive as pg strings. */
const COOK_CIK = "0001214156";
const pgRow = x => ({ ...x, shares: x.shares == null ? null : Number(x.shares).toFixed(4), price_per_share: x.price_per_share == null ? null : String(x.price_per_share),
  estimated_value: x.estimated_value == null ? null : Number(x.estimated_value).toFixed(2), transaction_date: x.transaction_date + "T00:00:00.000Z", superseded: false });
const NIKE_SEC = "https://www.sec.gov/Archives/edgar/data/320187/000032018726000051/wk-form4.xml";
const PERSON_TX = [
  ...tx.filter(x => x.owner_cik === COOK_CIK),
  { id: 9101, accession: "000032018726000051", ticker: "NKE", issuer_name: "NIKE, Inc.", issuer_cik: "0000320187", owner_name: "COOK TIMOTHY D", owner_cik: COOK_CIK, transaction_date: "2026-09-21",
    transaction_code: "P", acquired_disposed: "A", category: "reported_purchase", derivative: false, shares: 10000, price_per_share: 72.415, estimated_value: 724150, direct_ownership: "D",
    security_title: "Class B Common Stock", published_at: "2026-09-23T22:30:00Z", created_at: "2026-09-23T22:30:00Z", is_amendment: false, source_url: NIKE_SEC },
  { id: 9102, accession: "000032019326000990", ticker: "AAPL", issuer_name: "Apple Inc.", issuer_cik: "0000320193", owner_name: "COOK TIMOTHY D, ADAMS KATHERINE L", owner_cik: null,
    owners: [{ cik: COOK_CIK, name: "COOK TIMOTHY D" }, { cik: "0001408568", name: "ADAMS KATHERINE L" }], transaction_date: "2026-10-02", transaction_code: "G", acquired_disposed: "D", category: "other",
    derivative: false, shares: 2000, price_per_share: null, estimated_value: null, direct_ownership: "I", security_title: "Common Stock", published_at: "2026-10-03T21:00:00Z", created_at: "2026-10-03T21:00:00Z", is_amendment: false, source_url: SEC }
].map(pgRow).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
const sumOf = (rows, cat) => { const r = rows.filter(x => x.category === cat); return { count: r.length, shares: r.reduce((a, x) => a + Number(x.shares), 0).toFixed(4), value: r.reduce((a, x) => a + Number(x.estimated_value || 0), 0).toFixed(2) }; };
const totalsOf = rows => ({ transactions: rows.length, superseded: 0, filings: new Set(rows.map(x => x.accession)).size, purchases: sumOf(rows, "reported_purchase"), sales: sumOf(rows, "reported_sale"),
  other: { count: rows.filter(x => x.category === "other").length }, first_transaction_date: rows.map(x => x.transaction_date).sort()[0], last_transaction_date: rows.map(x => x.transaction_date).sort().at(-1),
  last_published_at: rows.map(x => x.published_at).sort().at(-1) });
const companyOf = (ticker, roles) => { const rows = PERSON_TX.filter(x => x.ticker === ticker), s = rows.map(x => x.transaction_date).sort();
  return { ticker, issuer_cik: rows[0].issuer_cik, issuer_name: rows[0].issuer_name, roles, first_transaction_date: s[0], last_transaction_date: s.at(-1), last_published_at: rows.map(x => x.published_at).sort().at(-1),
    transactions: rows.length, purchases_value: sumOf(rows, "reported_purchase").value, sales_value: sumOf(rows, "reported_sale").value }; };
const PERSON = {
  person: { cik: COOK_CIK, name: "COOK TIMOTHY D", filed_names: ["COOK TIMOTHY D"] },
  companies: [companyOf("AAPL", ["Chief Executive Officer", "Director"]), companyOf("NKE", ["Director"])],
  totals: { all: totalsOf(PERSON_TX), d30: totalsOf(PERSON_TX.filter(x => x.published_at >= "2026-09-15")) },
  transactions: PERSON_TX,
  filings: [...new Map(PERSON_TX.map(x => [x.accession, { accession: x.accession, form_type: "4", ticker: x.ticker, issuer_name: x.issuer_name, issuer_cik: x.issuer_cik, published_at: x.published_at, source_url: x.source_url,
    lines: PERSON_TX.filter(y => y.accession === x.accession).length }])).values()].sort((a, b) => b.published_at.localeCompare(a.published_at)),
  other_issuers: [], edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001214156&type=4&dateb=&owner=include&count=40", source: "SEC Form 4",
  disclaimer: "Public SEC records. Not a recommendation or a prediction."
};
// Every owner name in the fixtures that has a CIK: none of them may be offered the directory search instead of their file.
const KNOWN_PEOPLE = [...new Set([...tx, ...PRIVATE_TX].filter(x => x.owner_cik).map(x => x.owner_name))];
const COMPANY_PHOTOS = { ticker: "AAPL", complete: true, photos: { "cik:1214156": { src: PHOTOS["1214156"].src, sourceUrl: PHOTOS["1214156"].sourceUrl, credit: PHOTOS["1214156"].credit, source: "sec-proxy" } }, names: {},
  leaders: [{ name: "Arthur Levinson", roles: ["Chair"], src: PHOTOS["1197649"].src, credit: "Fixture Photographer · CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture_portrait_(cropped).jpg", insider: false }, { name: "Jony Example", roles: ["Founder"], insider: false },
    // A founder who also files Form 4 here (the photo job's twin: insider with insiderKey "cik:<owner CIK>").
    { name: "Katherine Adams", roles: ["Founder"], insider: true, insiderKey: "cik:1408568", wikidataUrl: "https://www.wikidata.org/wiki/Q99999999" }] };

/* ---------- the /v1/media contract (as src/media-batch.mjs answers it) ---------- */
const cleanTicker = v => { const t = String(v ?? "").trim().toUpperCase().replace(/\./g, "-"); return /^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t) ? t : null; };
const cleanCik = v => { const s = String(v ?? "").trim(); return /^\d{1,10}$/.test(s) ? s.replace(/^0+/, "") || null : null; };
/* opts: forms "server" (people= as "<owner>:<TICKER>", "<owner>:cik:<issuer>" or "<owner>", exactly as src/media-batch.mjs
   parses it) or "legacy" (an older engine: "<owner>:<TICKER>" only, the other forms listed as invalid); split (default
   true: retryAfterLogos and retryAfterPhotos beside retryAfter, as the engine sends them; false: retryAfter alone);
   logoPending (extra logos pending once); photoRetry (the photo hint while a headshot is pending: the engine says 8);
   queued ({owner CIK: n}: that person's pair is answered pending and listed in `queued` n times first, a company job
   still waiting for its turn, retryAfterPhotos 15). */
function mediaAnswer(url, seen, { forms = "server", split = true, logoPending = {}, photoRetry = 3, queued = {} } = {}) {
  const list = name => url.searchParams.getAll(name).join(",").split(",").map(s => s.trim()).filter(Boolean);
  const raw = { tickers: list("tickers"), people: list("people"), ciks: list("ciks") };
  if (raw.tickers.length > 60 || raw.people.length > 100 || raw.ciks.length > 60) return { status: 400, body: { error: "too many" } };
  const logos = {}, photos = {}, owners = {}, pending = { logos: [], photos: [] }, invalid = [], inQueue = [];
  const once = (key, times) => (seen[key] = (seen[key] || 0) + 1) <= (times || 0);
  const logo = key => { if (key in logos || pending.logos.includes(key)) return; if (once("L:" + key, LOGO_PENDING[key] || logoPending[key])) pending.logos.push(key); else logos[key] = key in LOGOS ? LOGOS[key] : null; };
  for (const t of raw.tickers) { const c = cleanTicker(t); if (c) logo(c); else invalid.push(t); }
  for (const c of raw.ciks) { const k = cleanCik(c); if (k) logo("cik:" + k); else invalid.push(c); }
  for (const p of raw.people) {
    const m = /^(\d{1,10})(?::(?:cik:(\d{1,10})|([^:]+)))?$/i.exec(p);
    const cik = m && cleanCik(m[1]), t = m && m[3] !== undefined ? cleanTicker(m[3]) : null, ic = m && m[2] !== undefined ? cleanCik(m[2]) : null;
    if (!cik || (m[3] !== undefined && !t) || (m[2] !== undefined && !ic) || (forms === "legacy" && !t)) { invalid.push(p); continue; }
    const pair = cik + (t ? ":" + t : ic ? ":cik:" + ic : "");
    if (t) logo(t); else if (ic) logo("cik:" + ic);
    if (ENTITIES[cik]) { owners[cik] = { entity: true, ticker: ENTITIES[cik] }; photos[cik] = null; logo(ENTITIES[cik]); continue; }
    // Only a pair that names an issuer can wait on a company job; the owner alone is answered from their record.
    if (t || ic) {
      if (once("Q:" + cik, queued[cik])) { pending.photos.push(pair); inQueue.push(pair); continue; }
      if (once("P:" + cik, PHOTO_PENDING[cik])) { pending.photos.push(pair); continue; }
    }
    photos[cik] = PHOTOS[cik] || PHOTOS_BY_CIK[cik] || null;
  }
  if (Object.keys(logos).length + Object.keys(photos).length + pending.logos.length + pending.photos.length === 0) return { status: 400, body: { error: "Nothing valid to look up: pass tickers, people (ownerCik:TICKER, ownerCik:cik:issuerCik or ownerCik) or ciks" } };
  const retryAfterPhotos = pending.photos.length ? (inQueue.length ? 15 : photoRetry) : 0, retryAfterLogos = pending.logos.length ? 2 : 0;
  const body = { logos, photos, owners, pending, queued: inQueue, retryAfter: retryAfterPhotos || retryAfterLogos, invalid };
  return { status: 200, body: split ? { ...body, retryAfterLogos, retryAfterPhotos } : body };
}
const keysOf = u => { const s = new URL(u, "http://x").searchParams; return [...(s.get("tickers") || "").split(",").filter(Boolean).map(t => "t:" + t), ...(s.get("ciks") || "").split(",").filter(Boolean).map(c => "c:" + c), ...(s.get("people") || "").split(",").filter(Boolean).map(p => "p:" + p)]; };

/* ---------- server and browser ---------- */
const server = createServer((req, res) => { serveStatic(req, res).then(f => { if (!f) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-lcd-text", "--font-render-hinting=none"] });
const CURATED = new Set();
const PAGE_CLS = {};   // layout shift totals while each page's records load (informational)   // Commons URLs the helper may load directly (read from the page)

// In the page from the first byte: layout shifts with their sources, and every tile's size and state when it is inserted.
const INIT = () => {
  window.__shifts = [];
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, at: Math.round(e.startTime), sources: (e.sources || []).map(s => s.node ? (s.node.nodeType === 1 ? s.node.tagName.toLowerCase() + (s.node.id ? "#" + s.node.id : "") + "." + String(s.node.className || "").split(" ").slice(0, 3).join(".") : "#text") : "?") }); }).observe({ type: "layout-shift", buffered: true }); } catch {}
  window.__first = new WeakMap(); window.__inserted = [];
  const measure = (t, tries) => requestAnimationFrame(() => { if (!t.isConnected) return; if (t.offsetWidth) window.__first.set(t, [t.offsetWidth, t.offsetHeight]); else if (tries < 120) measure(t, tries + 1); });
  new MutationObserver(ms => { for (const m of ms) for (const node of m.addedNodes) { if (node.nodeType !== 1) continue; for (const t of [node, ...node.querySelectorAll("[data-media]")]) if (t.matches("[data-media]")) { window.__inserted.push({ loading: t.classList.contains("is-loading"), media: t.dataset.media, ticker: t.dataset.ticker || "", cik: t.dataset.cik || "" }); measure(t, 0); } } })
    .observe(document, { childList: true, subtree: true });
  // Measuring tools see every scroll-reveal block in place.
  const go = () => { const M = window.InsidirMotion; if (!M) return; const held = new Set(document.querySelectorAll(".hf-pending,.hf-revealing")); M.revealAll(); if (held.size) for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect && held.has(a.effect.target)) { try { a.finish(); } catch {} } };
  addEventListener("DOMContentLoaded", () => setTimeout(go, 0)); addEventListener("load", go);
};

/* clock: the page runs on Playwright's clock (time flows as usual, and the scenario jumps it forward); photosQueued: the
   company report's photo job answers {complete:false, queued:true} this many times first (Infinity: always). */
async function open(width, path, { media = "ok", reducedMotion = "no-preference", context = null, answer = {}, hold = null, clock = false, photosQueued = 0 } = {}) {
  const ctx = context || await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion });
  const log = ctx.__log || (ctx.__log = { media: [], images: [], logoRoute: 0, thirdParty: [], seen: {}, answered: [] });
  if (!context) {
    await ctx.addInitScript(INIT);
    await ctx.route("**/v1/**", async route => {
      const url = new URL(route.request().url()), p = url.pathname;
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {});
      if (p.startsWith("/v1/media/")) {
        log.images.push(p);
        const item = IMAGES.get(p.slice("/v1/media/".length));
        return item ? route.fulfill({ status: 200, contentType: item.type, body: item.bytes, headers: { "Cache-Control": "public, max-age=31536000, immutable" } }).catch(() => {}) : json(404, { error: "Not found" });
      }
      if (p === "/v1/media") {
        const at = log.media.length;
        // On Playwright's clock, the page's own time of each ask (Date.now() there).
        const fake = ctx.__clocked ? await ctx.__page.evaluate(() => Date.now()).catch(() => 0) : 0;
        log.media.push({ url: p + url.search, keys: keysOf(url.search ? "?" + url.search.slice(1) : ""), at: Date.now() - (ctx.__t0 || Date.now()), fake });
        if (ctx.__hold) await ctx.__hold;   // held until the page has rendered (the bottom-of-page scenario)
        if (ctx.__media === "503") return json(503, { error: "SEC_USER_AGENT is required" });
        const out = mediaAnswer(url, log.seen, ctx.__answer);
        log.answered[at] = out.body.pending ? [...out.body.pending.logos.map(k => k.startsWith("cik:") ? "c:" + k.slice(4) : "t:" + k), ...out.body.pending.photos.map(k => "p:" + k)] : [];
        await new Promise(ok => setTimeout(ok, 60));
        return json(out.status, out.body);
      }
      if (p === "/v1/company/logo") { log.logoRoute++; return json(404, { error: "Not found" }); }
      if (p === "/v1/company/insiders") return json(200, insidersFor(url.searchParams.get("ticker")));
      if (p === "/v1/company/photos") {
        (log.photos || (log.photos = [])).push({ url: p + url.search, fake: ctx.__clocked ? await ctx.__page.evaluate(() => Date.now()).catch(() => 0) : 0 });
        if (log.photos.length <= ctx.__photosQueued) return json(200, { ticker: "AAPL", complete: false, queued: true, photos: {}, names: {}, leaders: [], sources: {} });
        return json(200, url.searchParams.get("ticker") === "AAPL" ? COMPANY_PHOTOS : { complete: true, photos: {}, names: {}, leaders: [] });
      }
      // GET /v1/people/<cik>: Tim Cook's personnel file; any other CIK has no imported records.
      if (p.startsWith("/v1/people/")) {
        const c = decodeURIComponent(p.slice("/v1/people/".length));
        if (!/^\d{1,10}$/.test(c)) return json(400, { error: "Valid reporting-person SEC CIK required" });
        return c.replace(/^0+/, "") === "1214156" ? json(200, PERSON) : json(404, { error: "No imported SEC records for this CIK" });
      }
      if (p === "/v1/transactions" && url.searchParams.has("ticker")) return json(200, { items: tx.filter(x => x.ticker === url.searchParams.get("ticker")).slice(0, Number(url.searchParams.get("limit")) || 30) });
      if (p === "/v1/filings" && url.searchParams.has("ticker")) return json(200, { items: filings.filter(x => x.ticker === url.searchParams.get("ticker")) });
      if (route.request().method() !== "GET") return json(200, { saved: true });
      return json(p in DATA ? 200 : 200, p in DATA ? DATA[p] : { items: [] });
    });
    await ctx.route(/wikimedia\.org/, route => {
      const u = route.request().url();
      log.wikimedia = (log.wikimedia || 0) + 1;
      const w = Number((/\/(\d+)px-[^/]+$/.exec(u) || [])[1]) || 400;
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(w * 1.25)}" viewBox="0 0 10 12.5"><rect width="10" height="12.5" fill="#555"/><circle cx="5" cy="4.6" r="2.2" fill="#888"/></svg>` });
    });
  }
  ctx.__media = media;
  ctx.__answer = answer;
  ctx.__hold = hold;
  ctx.__photosQueued = photosQueued;
  const page = await ctx.newPage();
  ctx.__page = page;
  ctx.__clocked = clock;
  if (clock) await page.clock.install();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("request", r => { const u = new URL(r.url()); if (u.origin !== base && r.resourceType() === "image") log.thirdParty.push(r.url()); });
  ctx.__t0 = Date.now();
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { ctx, page, errors, log };
}
const PATH = { dashboard: "/dashboard.html", people: "/people.html", explore: "/explore.html", filings: "/filings.html", watchlist: "/watchlist.html", filing: "/filing.html?accession=" + FILING.accession,
  "filing-private": "/filing.html?accession=" + PRIVATE.accession,
  research: "/research.html?ticker=AAPL", alerts: "/alerts.html", portfolio: "/portfolio.html", company: "/company.html?ticker=AAPL", "company-picker": "/company.html", person: "/person.html?cik=1214156" };
// Each page has rendered its records when this holds.
const RENDERED = {
  dashboard: () => document.querySelectorAll("[data-media]").length >= 12 && !/Loading/.test(document.querySelector("#v3-trades")?.textContent || "Loading"),
  people: () => document.querySelectorAll("#v10-people-results [data-media]").length >= 4,
  explore: () => document.querySelectorAll("#collection-rows [data-media]").length >= 12, filings: () => document.querySelectorAll("#collection-rows [data-media]").length >= 12,
  watchlist: () => document.querySelectorAll("#collection-rows [data-media]").length >= 6, filing: () => document.querySelectorAll("#filing-rows [data-media]").length >= 4,
  "filing-private": () => document.querySelectorAll("#filing-rows [data-media]").length >= 1 && !!document.querySelector("#filing-heading [data-media]"),
  research: () => document.querySelectorAll("#research-transactions [data-media]").length >= 4 && !!document.querySelector("#research-company [data-media]"),
  alerts: () => document.querySelectorAll("#alerts-real [data-media]").length >= 12, portfolio: () => document.querySelectorAll("#portfolio-activity [data-media]").length >= 4 && document.querySelectorAll("#manual-evidence [data-media]").length >= 4,
  company: () => document.querySelectorAll("#cx-insiders-table .cx-avatar").length >= 4 && !!document.querySelector("#cx-logo img"),
  "company-picker": () => document.querySelectorAll("#cx-picker-grid .cx-mark").length > 0 && [...document.querySelectorAll("#cx-picker-grid .cx-mark")].every(m => m.querySelector("img")),
  person: () => !!document.querySelector(".pf-photo__frame [data-media][data-cik]") && document.querySelectorAll("#pf-log [data-media]").length >= 4 && !!document.querySelector('#pf-log a[href^="person.html?cik="]')
};

/* What the fallback chain must show for a tile (the oracle), evaluated in the page with the fixture tables. */
const ORACLE = { LOGOS: Object.fromEntries(Object.entries(LOGOS).map(([k, v]) => [k, v && v.src])), PHOTOS: Object.fromEntries(Object.entries(PHOTOS).map(([k, v]) => [k, v.src])), MISSING_PHOTO, ENTITIES,
  BY_CIK: Object.fromEntries(Object.entries(PHOTOS_BY_CIK).map(([k, v]) => [k, v.src])), extended: true };
const inspect = (O) => {
  const M = window.InsidirMedia;
  const cik = v => String(v || "").replace(/^0+/, ""), tk = v => String(v || "").toUpperCase().replace(/\./g, "-");
  const expect = t => {
    const T = tk(t.dataset.ticker), C = cik(t.dataset.cik), IC = T ? "" : cik(t.dataset.issuerCik);
    if (t.dataset.media === "person") {
      if (C && T && O.PHOTOS[C] && O.PHOTOS[C] !== O.MISSING_PHOTO) return { state: "photo", src: O.PHOTOS[C] };
      if (C && !T && O.extended) { const src = O.BY_CIK[C] || O.PHOTOS[C]; if (src && src !== O.MISSING_PHOTO) return { state: "photo", src }; }
      const cur = M.photo(t.dataset.name, t.dataset.ticker);
      if (cur) return { state: "photo", src: cur.thumb };
      if (C && O.ENTITIES[C]) return { state: "logo", src: O.LOGOS[O.ENTITIES[C]] };
      if (T && O.LOGOS[T]) return { state: "stand-in", src: O.LOGOS[T] };
      if (IC && O.LOGOS["cik:" + IC]) return { state: "stand-in", src: O.LOGOS["cik:" + IC] };
      return { state: "monogram" };
    }
    const src = T ? O.LOGOS[T] : C ? O.LOGOS["cik:" + C] : null;
    return src ? { state: "logo", src } : { state: "monogram" };
  };
  // Boxes are measured at rest: a landing still in flight (a scale) is finished first.
  for (const a of document.getAnimations()) if (/^ins-land/.test(a.animationName || "")) { try { a.finish(); } catch {} }
  const tiles = [...document.querySelectorAll("[data-media]")].filter(t => t.offsetWidth > 0);
  return tiles.map(t => {
    const img = t.querySelector(":scope>img"), cs = getComputedStyle(t), is = img && getComputedStyle(img);
    // The tile's content box (inside its border) against the picture's box: both must match within 1px.
    const tr = t.getBoundingClientRect(), content = [tr.left + t.clientLeft, tr.top + t.clientTop, t.clientWidth, t.clientHeight];
    const off = el => { if (!el) return null; const r = el.getBoundingClientRect(); return +Math.max(Math.abs(r.left - content[0]), Math.abs(r.top - content[1]), Math.abs(r.width - content[2]), Math.abs(r.height - content[3])).toFixed(2); };
    const ir = img ? img.getBoundingClientRect() : null;
    const state = t.classList.contains("is-photo") ? "photo" : t.classList.contains("is-stand-in") ? "stand-in" : t.classList.contains("is-logo") ? "logo" : t.classList.contains("is-monogram") ? "monogram" : "loading";
    const first = window.__first.get(t);
    const pad = is ? parseFloat(is.paddingLeft) + parseFloat(is.paddingRight) : 0, padV = is ? parseFloat(is.paddingTop) + parseFloat(is.paddingBottom) : 0;
    const boxW = (ir ? ir.width : t.clientWidth) - pad, boxH = (ir ? ir.height : t.clientHeight) - padV;
    let sharp = null;
    if (img && img.naturalWidth && (state === "photo" || state === "logo" || state === "stand-in")) {
      const nw = img.naturalWidth, nh = img.naturalHeight, fit = is.objectFit;
      const scale = fit === "cover" ? Math.max(boxW / nw, boxH / nh) : Math.min(boxW / nw, boxH / nh);
      sharp = +(1 / scale).toFixed(2);   // natural pixels per rendered pixel
    }
    return { media: t.dataset.media, name: t.dataset.name || "", ticker: t.dataset.ticker || "", cik: t.dataset.cik || "", state, expect: expect(t), src: img?.getAttribute("src") || "",
      loaded: !!(img && img.complete && img.naturalWidth > 0), shown: state === "monogram" ? getComputedStyle(t.querySelector("svg")).display !== "none" : is ? is.visibility !== "hidden" && is.display !== "none" : false,
      size: [t.offsetWidth, t.offsetHeight], first: first || null, sharp, content: content.map(v => Math.round(v * 10) / 10),
      imgBox: ir ? [ir.left, ir.top, ir.width, ir.height].map(v => Math.round(v * 10) / 10) : null, imgOff: off(img), svgOff: off(t.querySelector(":scope>svg.ins-media__monogram")), hidden: t.getAttribute("aria-hidden"), role: t.getAttribute("role"), label: t.getAttribute("aria-label"), alt: img ? img.getAttribute("alt") : null,
      anchors: t.querySelectorAll("a").length, wait: t.hasAttribute("data-media-wait"), credit: t.dataset.credit || "", creditUrl: t.dataset.creditUrl || "", visible: cs.visibility !== "hidden" };
  });
};
// Tiles within 600px of the viewport (the helper's lazy margin), across and down; a strip scrolled sideways keeps the rest for later.
async function settleNear(page, ms = 20000) {
  return page.waitForFunction(() => [...document.querySelectorAll("[data-media]")].filter(t => { const r = t.getBoundingClientRect(); return t.offsetWidth > 0 && r.bottom > -600 && r.top < innerHeight + 600 && r.right > -600 && r.left < innerWidth + 600; })
    .every(t => !t.hasAttribute("data-media-wait") && !t.classList.contains("is-loading")), null, { timeout: ms, polling: 100 }).then(() => true, () => false);
}

/* Every person name opens that person's file. In the page: (1) each visible person tile with an owner CIK (but the
   personnel file's own subject photo) has person.html?cik=<CIK without leading zeros> as its link, or beside it in
   the nearest ancestor (up to four levels) that holds a person link; (2) no directory search (people.html?q=) for a
   name whose CIK is known; (3) every person.html link names a real CIK. */
const personLinks = known => {
  const bare = c => String(c || "").replace(/^0+/, "");
  const sig = n => String(n || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(w => w.length > 1).sort().join(" ");
  const knownSigs = new Set(known.map(sig));
  const tiles = [...document.querySelectorAll('[data-media="person"][data-cik]')].filter(t => t.offsetWidth > 0 && !t.closest(".pf-photo"));
  const missing = [];
  for (const t of tiles) {
    const want = "person.html?cik=" + bare(t.dataset.cik);
    let ok = Boolean(t.closest('a[href="' + want + '"]')), el = t, near = null;
    for (let i = 0; !ok && i < 4 && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelector('a[href^="person.html?cik="]')) { near = el; ok = Boolean(el.querySelector('a[href="' + want + '"]')); break; }
    }
    if (!ok) missing.push({ name: t.dataset.name, cik: t.dataset.cik, near: near ? [...near.querySelectorAll('a[href^="person.html"]')].map(a => a.getAttribute("href")) : null, where: String(el.className || el.tagName).slice(0, 60) });
  }
  const search = [...document.querySelectorAll('a[href*="people.html?q="]')].map(a => ({ q: new URL(a.href).searchParams.get("q"), text: a.textContent.trim().slice(0, 40) })).filter(x => knownSigs.has(sig(x.q)));
  const bad = [...document.querySelectorAll('a[href^="person.html"]')].map(a => a.getAttribute("href")).filter(h => !/^person\.html\?cik=[1-9]\d{0,9}$/.test(h));
  return { tiles: tiles.length, links: document.querySelectorAll('a[href^="person.html?cik="]').length, missing, search, bad };
};
function linkChecks(tag, r) {
  check(!r.missing.length, tag + ": every person tile with an owner CIK has a link to that person's file (person.html?cik=) beside it (" + r.tiles + " tiles, " + r.links + " links)", r.missing.slice(0, 6));
  check(!r.search.length, tag + ": no directory search (people.html?q=) for anyone whose CIK is known", r.search.slice(0, 6));
  check(!r.bad.length, tag + ": every person.html link carries a real CIK without leading zeros", r.bad.slice(0, 6));
}

function tileChecks(tag, tiles) {
  check(tiles.length > 0, tag + ": tiles are on the page", tiles.length);
  const wrong = tiles.filter(t => t.state !== t.expect.state || (t.expect.src && t.src !== t.expect.src));
  check(!wrong.length, tag + ": every tile shows what the fallback chain gives its person or company (photo, curated portrait, own logo, issuer logo standing in, initials last)", wrong.slice(0, 6));
  const unloaded = tiles.filter(t => t.state !== "monogram" && !(t.loaded && t.shown));
  check(!unloaded.length, tag + ": every visible tile holds a loaded image (complete, naturalWidth > 0)", unloaded.slice(0, 6));
  const monos = tiles.filter(t => t.state === "monogram");
  check(monos.every(t => t.expect.state === "monogram" && t.shown && ((t.media === "person" && t.cik === "9999991") || (t.media === "company" && /ZZZZ/.test(t.ticker)))), tag + ": initials only for the fixture keys with neither a photo nor a logo", monos.map(t => t.name || t.ticker));
  const standIns = tiles.filter(t => t.state === "stand-in");
  check(standIns.every(t => t.src === t.expect.src), tag + ": a person with no photo shows .is-stand-in with the issuer's logo src", standIns.length);
  const unfilled = tiles.filter(t => t.state === "monogram" ? !(t.svgOff !== null && t.svgOff <= 1) : t.state !== "loading" && !(t.imgOff !== null && t.imgOff <= 1));
  check(!unfilled.length, tag + ": every picture fills its tile (the <img>, or the initials' <svg>, equals the tile's content box within 1px)", unfilled.slice(0, 4).map(t => ({ name: t.name || t.ticker, state: t.state, content: t.content, imgBox: t.imgBox, imgOff: t.imgOff, svgOff: t.svgOff })));
  const moved = tiles.filter(t => t.first && (t.first[0] !== t.size[0] || t.first[1] !== t.size[1]));
  check(!moved.length, tag + ": tiles keep their size from first paint to settled", moved.slice(0, 4));
  const blurry = tiles.filter(t => t.sharp !== null && t.sharp < 2);
  check(!blurry.length, tag + ": every picture is at least 2x sharp in its tile", blurry.slice(0, 4).map(t => ({ name: t.name || t.ticker, sharp: t.sharp, size: t.size })));
  const aria = tiles.filter(t => t.role === "img" ? !t.label : t.hidden !== "true" || (t.alt !== null && t.alt !== ""));
  check(!aria.length, tag + ": tiles beside names are aria-hidden with alt=\"\" (labelled tiles are role=img with a label)", aria.slice(0, 4));
  check(tiles.every(t => !t.anchors), tag + ": no link inside a tile", tiles.filter(t => t.anchors).length);
  check(tiles.every(t => !t.wait), tag + ": nothing still waiting after settling", tiles.filter(t => t.wait).map(t => t.name || t.ticker));
}

try {
  for (const width of WIDTHS) for (const key of PAGES) {
    const tag = key + " " + width + "px";
    const { ctx, page, errors, log } = await open(width, PATH[key]);
    const rendered = await page.waitForFunction(RENDERED[key], null, { timeout: 20000 }).then(() => true, e => e.message);
    check(rendered === true, tag + ": the page rendered its records", rendered);
    if (rendered !== true) { await ctx.close(); continue; }
    if (key === "company-picker" || key === "company") {
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => ({ marks: [...document.querySelectorAll("#cx-picker-grid .cx-mark img")].map(i => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })),
        logo: document.querySelector("#cx-logo:not([hidden]) img")?.getAttribute("src") || null,
        avatars: [...document.querySelectorAll("#cx-insiders-table .cx-avatar,#cx-people-sec .cx-avatar,#cx-people-wiki .cx-avatar")].map(a => ({ name: a.closest("tr,article")?.querySelector("strong,h4")?.textContent, standIn: a.classList.contains("is-stand-in"), src: a.querySelector("img")?.getAttribute("src") || null, text: a.textContent })),
        credits: document.querySelector("[data-media-credits]")?.innerHTML || "", nested: document.querySelectorAll("a a").length }));
      if (key === "company-picker") {
        check(r.marks.length >= 12 && r.marks.every(m => m.ok && /^\/v1\/media\/[a-f0-9]{64}\.png$/.test(m.src)), tag + ": the picker shows a real logo from the media store for every company (" + r.marks.length + ")", r.marks);
        check(log.media.length === 1 && log.logoRoute === 0, tag + ": one /v1/media request for the whole picker, no /v1/company/logo per tile", { media: log.media.map(m => m.url), logoRoute: log.logoRoute });
      } else {
        check(r.logo === LOGOS.AAPL.src, tag + ": the report header shows the company's logo from /v1/media", r.logo);
        const cook = r.avatars.find(a => /Cook/i.test(a.name || "")), adams = r.avatars.find(a => /Adams/i.test(a.name || ""));
        check(cook && cook.src === PHOTOS["1214156"].src && !cook.standIn, tag + ": a person with a verified photo shows it", cook);
        check(adams && adams.standIn && adams.src === LOGOS.AAPL.src, tag + ": a person with no photo gets the company's logo standing in, not initials", adams);
        check(r.avatars.filter(a => !a.src).every(a => /Jony/.test(a.name || "") === false), tag + ": no initials while the company has a logo", r.avatars.filter(a => !a.src).map(a => a.name));
        check(/Fixture Photographer · CC BY 4\.0/.test(r.credits) && /commons\.wikimedia\.org\/wiki\/File:Fixture_portrait/.test(r.credits) && /SEC proxy statement/.test(r.credits), tag + ": the credits footnote names the Commons author, licence and file page, and the SEC source", r.credits.slice(0, 300));
        check(log.logoRoute === 0, tag + ": no /v1/company/logo request", log.logoRoute);
        /* Every person name (overview, insider table, people tab, leadership cards) is a link: to the person's own file
           when the CIK is known (a card adds "Open personnel file", never the search), else to the directory search for
           the name as filed (an insider: DOE JANE Q; a leader: "Arthur Levinson" -> "Levinson Arthur"). */
        await page.waitForFunction(() => document.querySelectorAll("#cx-people-wiki .cx-person").length >= 3, null, { timeout: 10000 }).catch(() => {});
        const names = await page.evaluate(() => [...document.querySelectorAll("#cx-insider-rows>div,#cx-insiders-table tr,#cx-people-sec .cx-person,#cx-people-wiki .cx-person")].map(r => ({
          where: r.closest("[id]").id, name: r.querySelector(".cx-person-name strong,h4")?.textContent.trim(), href: r.querySelector("a.cx-person-link")?.getAttribute("href") || null,
          file: r.querySelector("a.cx-person__file")?.getAttribute("href") || null, search: [...r.querySelectorAll('a[href^="people.html?q="]')].map(a => a.getAttribute("href")) })).filter(x => x.name));
        const ciks = Object.fromEntries(tx.filter(x => x.ticker === "AAPL").map(x => [x.owner_name, x.owner_cik.replace(/^0+/, "")]));
        const want = n => Object.entries(ciks).find(([k]) => { const w = k.split(" ")[0]; return new RegExp("\\b" + w + "\\b", "i").test(n); })?.[1] || null;
        const filedForm = n => { const w = n.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean); return [w.at(-1), ...w.slice(0, -1)].join(" "); };
        const card = x => x.where === "cx-people-sec" || x.where === "cx-people-wiki";
        const wrong = names.filter(x => {
          const c = want(x.name);
          if (c) return x.href !== "person.html?cik=" + c || x.search.length || (card(x) && x.file !== "person.html?cik=" + c);
          const q = "people.html?q=" + (x.where === "cx-people-wiki" ? encodeURIComponent(filedForm(x.name)) : "DOE%20JANE%20Q") + "#v10-directory";
          return x.href !== q || x.file || !x.search.every(h => h === q) || (x.where === "cx-people-sec" && x.search.length !== 2);
        });
        const wiki = names.filter(x => x.where === "cx-people-wiki");
        check(names.length >= 10 && wiki.length >= 3 && !wrong.length, tag + ": every person name is a link (" + names.length + " names, " + wiki.length + " leadership cards): the person's file (person.html?cik=) when the CIK is known, on the overview, the insider table, the people tab and a founder who files Form 4; else the directory search for the name as filed", wrong.length ? wrong : names.filter(x => x.where === "cx-people-wiki" || !x.href.startsWith("person.html")));
      }
      check(r.nested === 0, tag + ": no nested links", r.nested);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${key}-${width}.png`) });
      // The people tab too: reporting owners, each name opening the person's file.
      if (SHOTS && key === "company") {
        await page.click("#cx-tabs [data-tab='people']");
        await page.evaluate(() => { window.InsidirMotion?.revealAll(); document.getElementById("people").scrollIntoView({ block: "start" }); });
        await page.waitForTimeout(900);
        await page.screenshot({ path: join(SHOTS, `${key}-people-${width}.png`) });
        await page.screenshot({ path: join(SHOTS, `${key}-people-${width}-full.png`), fullPage: true });
      }
      check(errors.length === 0, tag + ": no page or console errors", errors);
      await ctx.close();
      continue;
    }
    const settled = await settleNear(page);
    const stuck = settled ? [] : await page.evaluate(() => [...document.querySelectorAll("[data-media]")].filter(t => { const r = t.getBoundingClientRect(); return t.offsetWidth > 0 && r.bottom > -600 && r.top < innerHeight + 600 && r.right > -600 && r.left < innerWidth + 600 && (t.hasAttribute("data-media-wait") || t.classList.contains("is-loading")); })
      .slice(0, 6).map(t => { const r = t.getBoundingClientRect(); let p = t.parentElement, clip = ""; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== "visible") { clip = p.className + " " + o; break; } p = p.parentElement; } return { name: t.dataset.name || t.dataset.ticker, cls: t.className, x: Math.round(r.left), y: Math.round(r.top), clip }; }));
    check(settled, tag + ": tiles near the viewport settle", stuck);
    // Loading: what was asked before scrolling or forcing anything.
    const nearFirst = await page.evaluate(() => [...document.querySelectorAll("[data-media]")].filter(t => { const r = t.getBoundingClientRect(); return t.offsetWidth > 0 && r.bottom > -600 && r.top < innerHeight + 600 && r.right > -600 && r.left < innerWidth + 600; }).length);
    const loadRequests = log.media.slice();
    const pendingSoFar = new Set(Object.entries(PHOTOS).filter(([, v]) => v.src === MISSING_PHOTO).flatMap(([cik]) => CO.flatMap(([t, , , o]) => o.some(x => x[1].replace(/^0+/, "") === cik) ? ["p:" + cik + ":" + t] : [])));
    let initial = 0, strayFollowUps = [], waves = 0;
    const askedBefore = new Set(), repeats = [];
    loadRequests.forEach((r, i) => {
      const fresh = r.keys.filter(k => !pendingSoFar.has(k));
      if (fresh.length) { waves++; if (i === 0 || initial === 0) initial++; else strayFollowUps.push({ i, fresh: fresh.slice(0, 6) }); }
      for (const k of fresh) if (askedBefore.has(k)) repeats.push(k);
      for (const k of r.keys) askedBefore.add(k);
      for (const k of log.answered[i] || []) pendingSoFar.add(k);
    });
    const firstAt = 0;
    // The overview renders its modules in priority order (first screen first, the rest in idle callbacks), so a module
    // drawn more than 150 ms after the first may ask in a batch of its own; no key is ever asked twice unless it was pending.
    if (key === "dashboard") check(initial === 1 && !repeats.length, tag + ": " + loadRequests.length + " /v1/media requests on load in " + waves + " render wave(s); no key asked twice unless pending (" + loadRequests.map((r, i) => r.keys.length + " keys at " + r.at + " ms" + (i ? " " + r.keys.join(" ") : "")).join(", ") + ")", { requests: loadRequests.map(r => r.url.slice(0, 200)), repeats });
    else {
      // Exactly one when tiles are near the first screen; none when the first tiles are further down (they ask as they come near).
      check(initial === (nearFirst ? 1 : 0) && !strayFollowUps.length, tag + ": " + (nearFirst ? "exactly one /v1/media request on load" : "no /v1/media request until tiles come near (none within 600px of the first screen)") + "; follow-ups ask only for keys that were pending (or a headshot whose image failed, once)", { nearFirst, requests: loadRequests.map(r => r.url.slice(0, 160)), strayFollowUps });
    }
    check(log.logoRoute === 0, tag + ": no /v1/company/logo request per tile", log.logoRoute);
    // Then every tile on the page, offscreen included.
    const ready = await page.evaluate(() => window.InsidirMedia.ready(document, { timeout: 20000 }));
    check(ready.settled, tag + ": InsidirMedia.ready() settles every tile", ready);
    await page.waitForTimeout(200);
    const tiles = await page.evaluate(inspect, ORACLE);
    tileChecks(tag, tiles);
    linkChecks(tag, await page.evaluate(personLinks, KNOWN_PEOPLE));
    if (key === "filing") {
      const joint = await page.evaluate(() => [...document.querySelectorAll("#filing-rows tr")].map(r => [...r.querySelectorAll('a[href^="person.html?cik="]')].map(a => a.getAttribute("href"))).find(h => h.length > 1) || []);
      check(joint.includes("person.html?cik=1214156") && joint.includes("person.html?cik=1408568"), tag + ": a joint filing's line names each reporting owner, each linked to their own file", joint);
    }
    if (key === "alerts" || key === "portfolio") {
      // Joint lines: each owner the engine lists links to their own file; with no list, each name split from the joined
      // owner_name opens the directory search (the ", Jr." stays on its name).
      const lines = await page.evaluate(() => [...document.querySelectorAll("#alerts-real tr,#portfolio-activity tr,#manual-evidence tr")]
        .map(r => [...r.querySelectorAll("a.ins-person-link")].map(a => [a.textContent.trim(), a.getAttribute("href")])).filter(l => l.length > 1));
      const listed = lines.find(l => l.some(([, h]) => h === "person.html?cik=1214156") && l.some(([, h]) => h === "person.html?cik=1408568"));
      check(Boolean(listed), tag + ": a joint filing's line names each owner the engine lists, each linked to their own file", lines);
      const split = lines.find(l => l.length === 2 && l[0][0] === "ROE RICHARD" && l[0][1] === "people.html?q=ROE%20RICHARD#v10-directory" && l[1][0] === "ROE MARY, JR." && l[1][1] === "people.html?q=ROE%20MARY%2C%20JR.#v10-directory");
      check(Boolean(split), tag + ": a joint line with no owner list names each owner (a \", Jr.\" kept on its name), each opening the directory search", lines);
    }
    if (key === "person") {
      // The joint filing in the activity log names his co-owner, linked to her own file.
      const joint = await page.evaluate(() => [...document.querySelectorAll('#pf-log a[href^="person.html?cik="]')].map(a => ({ href: a.getAttribute("href"), text: a.textContent.trim() })));
      check(joint.some(j => j.href === "person.html?cik=1408568"), tag + ": the joint filing's co-owner links to her own file (person.html?cik=1408568)", joint);
    }
    const curated = await page.evaluate(() => [...document.querySelectorAll("img")].map(i => i.currentSrc || i.src).filter(s => /wikimedia\.org/.test(s)));
    for (const u of curated) CURATED.add(u);
    const third = [...new Set(log.thirdParty)].filter(u => !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(u));
    check(!third.length, tag + ": no image host but this origin and the curated Wikimedia Commons files", third);
    const extra = await page.evaluate(() => {
      const shifts = window.__shifts || [];
      return { cls: +shifts.reduce((s, e) => s + e.value, 0).toFixed(4), tileShift: +shifts.filter(e => e.sources.some(s => /ins-media/.test(s))).reduce((s, e) => s + e.value, 0).toFixed(4), shifts: shifts.slice(0, 6),
        nested: document.querySelectorAll("a a").length, credits: [...document.querySelectorAll("[data-media-credits]")].map(c => c.innerHTML).join(" | "),
        commons: [...document.querySelectorAll("[data-media].is-photo[data-credit-url*='commons.wikimedia.org']")].map(t => ({ name: t.dataset.creditName, credit: t.dataset.credit, url: t.dataset.creditUrl })) };
    });
    // Tiles must never move anything; the page's own data loading (rows arriving) is reported, not judged here.
    check(extra.tileShift < 0.005, tag + ": layout shift from tiles " + extra.tileShift + " (under 0.005; page total while its records load: " + extra.cls + ")", extra.shifts);
    PAGE_CLS[tag] = extra.cls;
    check(extra.nested === 0, tag + ": no nested links", extra.nested);
    const missing = extra.commons.filter(c => !extra.credits.includes(c.credit.split(" · ")[0].replace(/&/g, "&amp;")) || !extra.credits.includes(c.url.replace(/&/g, "&amp;")) || !/CC BY|Public domain/.test(c.credit) || !extra.credits.includes(c.credit.split(" · ").at(-1)));
    check(!missing.length && (!extra.commons.length || extra.credits.length > 0), tag + ": the credits footnote lists every Commons photo with author, licence and file page (" + extra.commons.length + ")", { missing, credits: extra.credits.slice(0, 300) });
    if (SHOTS) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(SHOTS, `${key}-${width}.png`) });
      await page.screenshot({ path: join(SHOTS, `${key}-${width}-full.png`), fullPage: true });
    }
    check(errors.length === 0, tag + ": no page or console errors", errors);
    await ctx.close();
  }

  /* ---------- once: failure modes and reuse ---------- */
  if (ONCE) {
    // 1. The batch is unavailable (503): curated marks and portraits, then initials; no errors.
    {
      const { ctx, page, errors, log } = await open(1440, "/alerts.html", { media: "503" });
      await page.waitForFunction(RENDERED.alerts, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document, { timeout: 8000 }));
      const t = await page.evaluate(() => [...document.querySelectorAll("[data-media]")].map(x => ({ media: x.dataset.media, ticker: x.dataset.ticker, name: x.dataset.name, state: x.classList.contains("is-photo") ? "photo" : x.classList.contains("is-logo") ? "logo" : x.classList.contains("is-monogram") ? "monogram" : "loading", src: x.querySelector("img")?.getAttribute("src") || "", real: x.dataset.realSource || "", ok: (x.querySelector("img")?.naturalWidth || 0) > 0 })));
      const apple = t.filter(x => x.media === "company" && x.ticker === "AAPL"), cook = t.find(x => /COOK/.test(x.name || "")), kress = t.find(x => /KRESS/.test(x.name || "")), woods = t.find(x => /WOODS/.test(x.name || ""));
      check(apple.length && apple.every(x => x.state === "logo" && /assets\/icons\/apple\.svg/.test(x.src) && /Apple_logo_black/.test(x.real) && x.ok), "503: companies with a curated mark show it (Apple)", apple);
      check(cook && cook.state === "photo" && /upload\.wikimedia\.org.*Tim_Cook/.test(cook.src), "503: a person with a curated Commons portrait shows it (Tim Cook)", cook);
      check(kress && kress.state === "logo" && /nvidia\.svg/.test(kress.src), "503: a person without one gets the company's curated mark standing in (Colette Kress, NVIDIA)", kress);
      check(woods && woods.state === "monogram" && t.filter(x => x.media === "company" && x.ticker === "XOM").every(x => x.state === "monogram"), "503: initials when nothing curated exists (Exxon Mobil, Darren Woods)", woods);
      check(log.media.length === 1, "503: the unavailable batch is not asked again on this visit", log.media.length);
      check(errors.length === 0, "503: no page or console errors", errors);
      if (SHOTS) { await page.waitForTimeout(1500); await page.locator("#alerts-real").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, "alerts-503-1440.png") }); }
      await ctx.close();
    }
    // 2. A headshot whose image 404s: asked again once, then the company's logo stands in.
    {
      const { ctx, page, log } = await open(1440, "/alerts.html");
      await page.waitForFunction(RENDERED.alerts, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document, { timeout: 15000 }));
      const woods = await page.evaluate(() => [...document.querySelectorAll("[data-media][data-cik='1408356']")].map(x => ({ state: x.className, src: x.querySelector("img")?.getAttribute("src") })));
      const asked = log.media.filter(r => r.keys.includes("p:1408356:XOM")).length;
      check(woods.length && woods.every(w => /is-stand-in/.test(w.state) && w.src === LOGOS.XOM.src), "image 404: the person's tile steps down to the company's logo", woods);
      check(asked === 2, "image 404: the headshot is asked for again exactly once", asked);
      await ctx.close();
    }
    // 3. sessionStorage: a second page shows final tiles at insertion and asks for nothing it already knows.
    {
      const { ctx, page, log } = await open(1440, "/filings.html");
      await page.waitForFunction(RENDERED.filings, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document));
      await page.waitForTimeout(500);   // the cache is written 300 ms after the last answer
      const before = log.media.length;
      await page.goto(base + "/explore.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(RENDERED.explore, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document));
      const inserted = await page.evaluate(() => window.__inserted);
      const loading = inserted.filter(x => x.loading);
      check(inserted.length >= 12 && !loading.length, "cache: on the next page every known tile is final when it is inserted (no dots, no swap)", { inserted: inserted.length, loading });
      check(log.media.length === before, "cache: the next page sends no /v1/media request for what it already knows", log.media.slice(before).map(r => r.url));
      await ctx.close();
    }
    // 4. Reduced motion: pictures appear without the landing animation.
    {
      const { ctx, page } = await open(1440, "/explore.html", { reducedMotion: "reduce" });
      await page.waitForFunction(RENDERED.explore, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document));
      const anims = await page.evaluate(() => [...document.querySelectorAll("[data-media]>img,[data-media]>svg")].reduce((n, el) => n + el.getAnimations().filter(a => /ins-land/.test(a.animationName || "")).length, 0) + [...document.querySelectorAll("[data-media]")].filter(t => getComputedStyle(t.querySelector("img")).animationName !== "none").length);
      check(anims === 0, "reduced motion: no landing animation on any tile", anims);
      await ctx.close();
    }
    // 5. Motion: a picture that arrives after first paint fades in place on the site's short ease-out.
    {
      const { ctx, page } = await open(1440, "/explore.html");
      await page.waitForFunction(RENDERED.explore, null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document));
      const r = await page.evaluate(() => { const t = document.querySelector("[data-media][data-land]"); const cs = t && getComputedStyle(t.querySelector("img")); return t ? { name: cs.animationName, timing: cs.animationTimingFunction.slice(0, 20), dur: cs.animationDuration } : null; });
      check(r && /ins-land-[ab]/.test(r.name) && /^cubic-bezier\(/.test(r.timing) && parseFloat(r.dur) > 0 && parseFloat(r.dur) <= 0.35, "motion: late pictures fade in place (ins-land) on the site's short ease-out (--hf-spring over --hf-spring-dur, at most .35s)", r);
      await ctx.close();
    }
    // 6. A cold logo while a headshot job waits its turn (the engine says retryAfter 15 for the whole answer): the logo
    //    keeps its own 2 s schedule, so the person's tile shows the company's logo standing in long before 15 s.
    {
      const { ctx, page, log, errors } = await open(1440, "/alerts.html", { answer: { logoPending: { TSLA: 1 }, photoRetry: 15, split: false } });
      await page.waitForFunction(RENDERED.alerts, null, { timeout: 20000 });
      const standIn = await page.waitForFunction(() => { const m = document.querySelector("[data-media][data-cik='1494730']"); return m && m.classList.contains("is-stand-in") ? Math.round(performance.now()) : 0; }, null, { timeout: 12000, polling: 50 }).then(h => h.jsonValue(), () => 0);
      const asks = log.media.filter(r => r.keys.includes("t:TSLA")), photoAsks = log.media.filter(r => r.keys.includes("p:1494730:TSLA"));
      const gap = asks.length > 1 ? asks[1].at - asks[0].at : null;
      check(asks.length >= 2 && gap !== null && gap < 3500 && photoAsks.length === 1, "logo schedule: a pending logo is asked again " + gap + " ms after the first ask while the headshot waits (retryAfter 15 paces headshots only)", { asks: asks.map(r => r.at), photoAsks: photoAsks.map(r => r.at) });
      check(standIn > 0, "logo schedule: the person waiting for a headshot shows the company's logo standing in within seconds, not after the photo queue", standIn);
      check(errors.length === 0, "logo schedule: no page or console errors", errors);
      await ctx.close();
    }
    // 7. The photo credits with the reader at the very bottom when the pictures arrive: the footnote holds its space
    //    from the start and takes new text only off screen, so the footer and the notes below it do not move.
    for (const [key, width] of [["people", 1440], ["filing", 1440], ["alerts", 1440], ["alerts", 390], ["portfolio", 390]]) {
      const tag = "credits at the bottom, " + key + " " + width + "px";
      let release = () => {};
      const hold = new Promise(ok => { release = ok; });
      const { ctx, page, errors } = await open(width, PATH[key], { hold });
      await page.waitForFunction(RENDERED[key], null, { timeout: 20000 });
      await page.waitForTimeout(900);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(700);
      const look = () => page.evaluate(() => { const f = document.querySelector("footer.v13-footer") || document.querySelector("footer"), c = document.querySelector("[data-media-credits]");
        return { now: performance.now(), y: scrollY, height: document.documentElement.scrollHeight, footer: f ? Math.round(f.getBoundingClientRect().top) : null, credits: c ? c.innerHTML : null, held: c ? c.offsetHeight : 0 }; });
      const before = await look();
      release();
      await settleNear(page, 20000);
      await page.waitForTimeout(1600);
      const after = await look();
      const shifts = await page.evaluate(t0 => (window.__shifts || []).filter(e => e.at >= t0), before.now);
      const total = +shifts.reduce((a, e) => a + e.value, 0).toFixed(4);
      check(total < 0.005 && after.footer === before.footer, tag + ": layout shift " + total + " while the pictures land; the footer stays at " + after.footer + "px on screen", { before, after, shifts: shifts.slice(0, 4) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      const text = await page.evaluate(() => document.querySelector("[data-media-credits]")?.innerHTML || "");
      check(/^(Photos: |Logos are trademarks)/.test(text), tag + ": the footnote's text goes in once it is off screen (" + text.replace(/<[^>]+>/g, "").slice(0, 70) + "...)", text.slice(0, 200));
      check(errors.length === 0, tag + ": no page or console errors", errors);
      await ctx.close();
    }
    // 8. The engine takes people= as "<owner>:cik:<issuer>": a person at an issuer with no ticker gets their headshot. An older
    //    engine that takes "<owner>:<TICKER>" only lists that form as invalid: the tile steps down to the issuer's logo, by CIK.
    for (const forms of ["server", "legacy"]) {
      const { ctx, page, log, errors } = await open(1440, PATH["filing-private"], { answer: { forms } });
      await page.waitForFunction(RENDERED["filing-private"], null, { timeout: 20000 });
      await page.evaluate(() => window.InsidirMedia.ready(document, { timeout: 10000 }));
      const tiles = await page.evaluate(inspect, { ...ORACLE, extended: forms === "server" });
      const smith = tiles.find(t => t.cik === "1900001");
      if (forms === "server") check(smith && smith.state === "photo" && smith.src === PHOTOS_BY_CIK["1900001"].src, "issuer without a ticker: asked as people=1900001:cik:1999999, the person's headshot shows", { smith, asked: log.media.map(r => r.url) });
      else check(smith && smith.state === "stand-in" && smith.src === LOGOS["cik:1999999"].src, "older engine (owner:TICKER only): the person at an issuer with no ticker gets that issuer's logo standing in, found by CIK", { smith, asked: log.media.map(r => r.url) });
      check(log.media.some(r => r.keys.includes("p:1900001:cik:1999999")), "issuer without a ticker (" + forms + " engine): the request names the issuer by CIK", log.media.map(r => r.url));
      check(log.media.filter(r => r.keys.includes("p:1900001:cik:1999999")).length === 1, "issuer without a ticker (" + forms + " engine): asked once, answered or listed invalid, never asked again", log.media.map(r => r.url));
      check(errors.length === 0, "issuer without a ticker (" + forms + " engine): no page or console errors", errors);
      await ctx.close();
    }
    // 9. A headshot whose company job waits its turn (the engine lists the pair in `queued`, retryAfterPhotos 15). On
    //    Playwright's clock: (a) Musk's job queued 14 times, then pending once, then answered: asked again past the ten-step
    //    schedule, the company's logo standing in meanwhile, and the photo lands; (b) Kress's job queued for good: asked for
    //    about 15 minutes in all, then the tile settles on NVIDIA's logo standing in and nothing more is asked.
    for (const [label, times, cik, ticker] of [["queued, then answered", 14, "1494730", "TSLA"], ["queued for good", Infinity, "1580197", "NVDA"]]) {
      const KEY = "p:" + cik + ":" + ticker;
      const { ctx, page, log, errors } = await open(1440, "/alerts.html", { clock: true, answer: { queued: { [cik]: times } } });
      await page.waitForFunction(RENDERED.alerts, null, { timeout: 20000 });
      await page.waitForFunction(c => !!document.querySelector("[data-media][data-cik='" + c + "']"), cik, { timeout: 10000 });
      const state = () => page.evaluate(c => { const t = document.querySelector("[data-media][data-cik='" + c + "']"); return { cls: t.className, wait: t.hasAttribute("data-media-wait"), src: t.querySelector("img")?.getAttribute("src") || "" }; }, cik);
      let standIn = false, now = null;
      const STEP = 8000, LIMIT = 17.5 * 60e3, t0 = await page.evaluate(() => Date.now());
      for (let fake = 0; fake < LIMIT; fake += STEP) {
        await page.clock.fastForward(STEP);
        await page.waitForTimeout(110);
        now = await state();
        if (/is-stand-in/.test(now.cls)) standIn = true;
        if (times !== Infinity && /is-photo/.test(now.cls) && !now.wait) break;
      }
      await page.waitForTimeout(400);
      now = await state();
      const end = await page.evaluate(() => Date.now());
      const asks = log.media.filter(r => r.keys.includes(KEY)).map(r => ({ ...r, fake: r.fake - t0 })), span = asks.length ? asks.at(-1).fake - asks[0].fake : 0;
      if (times === 14) {
        check(/is-photo/.test(now.cls) && now.src === PHOTOS[cik].src, "queued photo job (" + label + "): the headshot lands once the job has run", { now, asks: asks.map(a => a.fake) });
        check(asks.length >= 16, "queued photo job (" + label + "): " + asks.length + " asks for the pair, past the ten-step schedule (queued asks do not use it up)", asks.map(a => a.fake));
        check(standIn, "queued photo job (" + label + "): the company's logo stands in while the job waits", now);
        const gaps = asks.slice(1).map((a, i) => a.fake - asks[i].fake);
        check(gaps.slice(0, 13).every(g => g >= 15000) && span < 15 * 60e3, "queued photo job (" + label + "): asked every 15-60 s while queued, the photo within " + Math.round(span / 1000) + " s (under the 15-minute ceiling)", gaps);
      } else {
        const quiet = end - t0 - (asks.at(-1)?.fake || 0);
        check(asks.length > 11 && span <= 15 * 60e3 + 2 * STEP && !now.wait && /is-stand-in/.test(now.cls) && now.src === LOGOS[ticker].src, "queued photo job (" + label + "): " + asks.length + " asks over " + Math.round(span / 1000) + " s, then the tile settles on the company's logo standing in", { asks: asks.map(a => a.fake), now });
        check(quiet >= 90000, "queued photo job (" + label + "): nothing asked in the last " + Math.round(quiet / 1000) + " s (no key is asked again past about 15 minutes)", asks.map(a => a.fake));
      }
      check(errors.length === 0, "queued photo job (" + label + "): no page or console errors", errors);
      await ctx.close();
    }
    // 10. The company report's photo job waits its turn ({complete:false, queued:true}): polled every 15-30 s without advancing
    //     its schedule (16 queued answers, more than the 13 steps), the headshot showing once the job has run; queued for good,
    //     it stops asking about 15 minutes after the first answer.
    for (const [label, times] of [["queued, then complete", 16], ["queued for good", Infinity]]) {
      const { ctx, page, log, errors } = await open(1440, "/company.html?ticker=AAPL#people", { clock: true, photosQueued: times });
      await page.waitForFunction(RENDERED.company, null, { timeout: 20000 });
      const cook = () => page.evaluate(src => [...document.querySelectorAll("#cx-insiders-table .cx-avatar img")].some(i => i.getAttribute("src") === src), PHOTOS["1214156"].src);
      let shown = false;
      const STEP = 8000, LIMIT = 17 * 60e3;
      for (let fake = 0; fake < LIMIT && !shown; fake += STEP) {
        await page.clock.fastForward(STEP);
        await page.waitForTimeout(110);
        if (times !== Infinity) shown = await cook();
      }
      const end = await page.evaluate(() => Date.now());
      const asks = log.photos || [], gaps = asks.slice(1).map((a, i) => a.fake - asks[i].fake), span = asks.length ? asks.at(-1).fake - asks[0].fake : 0;
      if (times !== Infinity) {
        check(shown && asks.length === 17, "company photos (" + label + "): asked " + asks.length + " times, past the 13-step schedule, and the verified headshot shows once the job is done", { shown, asks: asks.map(a => a.fake) });
        check(gaps.slice(0, 16).every(g => g >= 15000 && g <= 15000 + 30000), "company photos (" + label + "): asked every 15-30 s while queued (gaps " + gaps.slice(0, 16).map(g => Math.round(g / 1000)).join(", ") + " s)", gaps);
      } else {
        const quiet = end - (asks.at(-1)?.fake || end);
        check(asks.length > 14 && span <= 15 * 60e3 + 2 * STEP && quiet >= 90000, "company photos (" + label + "): " + asks.length + " asks over " + Math.round(span / 1000) + " s, then none for " + Math.round(quiet / 1000) + " s (about 15 minutes at most)", asks.map(a => a.fake - asks[0].fake));
      }
      check(errors.length === 0, "company photos (" + label + "): no page or console errors", errors);
      await ctx.close();
    }
  }
} catch (e) {
  failed.push("check crashed: " + (e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
for (const p of passed) console.log("PASS " + p);
console.log("INFO page layout shift totals while records load (not caused by tiles): " + JSON.stringify(PAGE_CLS));
for (const f of failed) console.log("FAIL " + f);
console.log(`\n${passed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

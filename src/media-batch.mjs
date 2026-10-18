/* GET /v1/media: the real logo or headshot for every company and person on a page, in one round
 * trip. It answers only from what the resolvers already decided (media_records + stored bytes)
 * and never waits on an upstream source: anything not known yet is listed in `pending` and its
 * resolution starts in bounded background queues (logos here, 4 at a time and at most 20 new per
 * request; photos in the people-photos job queue, 2 companies at a time).
 *
 * people= takes three forms (owner CIKs and issuer CIKs with or without leading zeros):
 *   <owner CIK>:<TICKER>        the reporting owner at the issuer they file for (the usual form)
 *   <owner CIK>:cik:<issuer CIK> the same for an issuer known by CIK (no ticker filed): its logo is
 *                                answered as logos["cik:<issuer CIK>"] and the photo is looked for at
 *                                that issuer (a job only when it is SEC-listed: jobs need a ticker)
 *   <owner CIK>                  no issuer known: answered from the person-photo record alone, no job.
 *                                Without a usable record nothing was looked for, so photos[<owner CIK>]
 *                                is left out of the answer (not null: null means "none exists"); a
 *                                takedown is answered null. The same person asked with an issuer is
 *                                still answered (and looked for) as usual.
 *
 *   logos[TICKER] / logos["cik:<CIK>"]  {src,w,h,source,name,alt?:{src,w,h}} | null (resolved, none exists)
 *   photos[<owner CIK>]                 {src,w,h,source,credit,sourceUrl,name?} | null (none, or taken down);
 *                                       absent when only the owner-alone form was asked and nothing is on record
 *   owners[<owner CIK>]                 {entity:true, ticker|null}: a fund or company files there, not a person
 *   pending {logos:[key], photos:[pair, in the form it was asked]}, queued [pairs whose company job is
 *   still waiting for its turn], retryAfter (s: the slowest pending kind), retryAfterLogos and
 *   retryAfterPhotos (s: each kind on its own, 0 when none is pending), invalid [raw entries]
 *
 * Names never come from the request. person-photo records are global by owner CIK, so a name a
 * client typed for someone else's CIK could attach the wrong face to that CIK for every member.
 * With the engine's database (loadOwners given), a pair starts or extends a company job only when
 * the SEC import confirms that owner filed for that issuer (or the company's finished roster has
 * them), and the job gets the name from that import; any other pair is null with no job (pending
 * only while a job someone else started for that company is under way). An issuer CIK without a
 * ticker is looked up only when the import has filings for it (loadIssuers). The website preview
 * has no database: there a company's own roster job may start, and only listed CIKs resolve. */
import { tickerIndex as secTickerIndex } from "./intelligence.mjs";
import { getRecord, hasMedia, mediaSha } from "./media-store.mjs";
import { isEntityName } from "./person-match.mjs";
import { excludedPhoto } from "./photo-exclusions.mjs";

const failure = (status, message) => Object.assign(new Error(message), { status });
export const MEDIA_LIMITS = Object.freeze({ tickers: 60, people: 100, ciks: 60, wait: 1500 });
const SETTLED_MS = 15 * 60 * 1000, ERROR_BACKOFF_MS = 60 * 1000, PHOTO_SIZE = 256;
const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); });

/* SEC and market data list share classes with a hyphen (BRK-B), so BRK.B is accepted as an alias. */
export const cleanTicker = value => {
  const t = String(value ?? "").trim().toUpperCase().replace(/\./g, "-");
  return /^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t) ? t : null;
};
/* An SEC CIK without leading zeros ("0001214156" -> "1214156"), or null. */
export const cleanCik = value => {
  const s = String(value ?? "").trim();
  return /^\d{1,10}$/.test(s) ? s.replace(/^0+/, "") || null : null;
};
const pad10 = key => String(key).padStart(10, "0");

/* ?tickers=AAPL,BRK.B&people=1214156:AAPL,1214156:cik:320193,1214156&ciks=1234567&wait=1200
 *   -> {tickers, people: [{cik, ticker|null, issuerCik|null, pair}], ciks, wait, invalid}.
 * pair is the entry in one spelling (no leading zeros, upper-case ticker) and is how pending and queued
 * list it. Throws {status:400} when a list is over its limit or nothing valid is left. */
const PERSON_ENTRY = /^(\d{1,10})(?::(?:cik:(\d{1,10})|([^:]+)))?$/i;
export function parsePersonEntry(value) {
  const m = PERSON_ENTRY.exec(String(value ?? "").trim());
  const cik = m && cleanCik(m[1]);
  if (!cik) return null;
  if (m[2] !== undefined) { const issuerCik = cleanCik(m[2]); return issuerCik ? { cik, ticker: null, issuerCik, pair: cik + ":cik:" + issuerCik } : null; }
  if (m[3] !== undefined) { const ticker = cleanTicker(m[3]); return ticker ? { cik, ticker, issuerCik: null, pair: cik + ":" + ticker } : null; }
  return { cik, ticker: null, issuerCik: null, pair: cik };
}
export function parseMediaQuery(url) {
  const sp = url.searchParams;
  const list = name => sp.getAll(name).join(",").split(",").map(s => s.trim()).filter(Boolean);
  const raw = { tickers: list("tickers"), people: list("people"), ciks: list("ciks") };
  for (const name of ["tickers", "people", "ciks"]) if (raw[name].length > MEDIA_LIMITS[name]) throw failure(400, "At most " + MEDIA_LIMITS[name] + " " + name + " per request");
  const invalid = [];
  const bad = value => { if (invalid.length < 50) invalid.push(String(value).slice(0, 40)); };
  const tickers = [], people = [], ciks = [], pairs = new Set();
  for (const value of raw.tickers) {
    const t = cleanTicker(value);
    if (!t) bad(value); else if (!tickers.includes(t)) tickers.push(t);
  }
  for (const value of raw.people) {
    const entry = parsePersonEntry(value);
    if (!entry) { bad(value); continue; }
    if (!pairs.has(entry.pair)) { pairs.add(entry.pair); people.push(entry); }
  }
  for (const value of raw.ciks) {
    const cik = cleanCik(value);
    if (!cik) bad(value); else if (!ciks.includes(cik)) ciks.push(cik);
  }
  if (!tickers.length && !people.length && !ciks.length) throw failure(400, "Nothing valid to look up: pass tickers, people (ownerCik:TICKER, ownerCik:cik:issuerCik or ownerCik) or ciks");
  const wait = Number(sp.get("wait"));
  return { tickers, people, ciks, wait: Number.isFinite(wait) ? Math.max(0, Math.min(MEDIA_LIMITS.wait, Math.round(wait))) : 0, invalid };
}

/* The SEC ticker file as two maps, built once per (24 h cached) index object instead of scanning
 * ~10k entries per lookup: TICKER -> {ticker, cik (10 digits), name} and CIK (no zeros) -> TICKER. */
const mapsMemo = new WeakMap();
export function indexMaps(index) {
  if (!index || typeof index !== "object") return { byTicker: new Map(), byCik: new Map() };
  const memo = mapsMemo.get(index);
  if (memo) return memo;
  const byTicker = new Map(), byCik = new Map();
  for (const r of Object.values(index)) {
    const id = String(r?.cik_str ?? ""), ticker = String(r?.ticker || "").toUpperCase();
    if (!/^\d{1,10}$/.test(id) || !ticker) continue;
    const cik = pad10(id);
    if (!byTicker.has(ticker)) byTicker.set(ticker, { ticker, cik, name: String(r.title || ticker).slice(0, 150) });
    const key = id.replace(/^0+/, "");
    if (key && !byCik.has(key)) byCik.set(key, ticker);
  }
  const maps = { byTicker, byCik };
  mapsMemo.set(index, maps);
  return maps;
}

/* A small priority limiter: "user" work (a page someone is looking at) runs before "warm" work.
 * Within "user", the requester served least recently goes first, and one requester may hold at
 * most maxPerRequester waiting jobs, so nobody can fill the queue for everyone else. */
export function createLimiter(concurrency = 4, { maxQueue = 400, maxPerRequester = 60 } = {}) {
  let active = 0, turn = 0;
  const queues = { user: [], warm: [] }, served = new Map();
  const nextUser = () => {
    let best = -1;
    for (let i = 0; i < queues.user.length; i++) if (best < 0 || (served.get(queues.user[i].requester) || 0) < (served.get(queues.user[best].requester) || 0)) best = i;
    return best < 0 ? null : queues.user.splice(best, 1)[0];
  };
  const pump = () => {
    while (active < concurrency) {
      const job = nextUser() || queues.warm.shift();
      if (!job) return;
      served.delete(job.requester);
      served.set(job.requester, ++turn);
      while (served.size > 5000) served.delete(served.keys().next().value);
      job.queue = null;
      active++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  };
  const full = message => Object.assign(new Error(message), { busy: true });
  return {
    /* -> {promise, job, accepted} */
    run(fn, priority = "user", requester = "anonymous") {
      const job = { fn, requester: String(requester || "anonymous") };
      const promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
      const level = priority === "warm" ? "warm" : "user";
      if (queues.user.length + queues.warm.length >= maxQueue) { job.reject(full("Logo queue is full")); return { promise, job, accepted: false }; }
      if (level === "user" && queues.user.filter(j => j.requester === job.requester).length >= maxPerRequester) { job.reject(full("Too many logos waiting for this requester")); return { promise, job, accepted: false }; }
      job.queue = level;
      queues[job.queue].push(job);
      pump();
      return { promise, job, accepted: true };
    },
    promote(job, requester) {
      if (job?.queue !== "warm") return;
      queues.warm.splice(queues.warm.indexOf(job), 1);
      job.queue = "user";
      if (requester) job.requester = String(requester);
      queues.user.push(job);
    },
    stats: () => ({ active, queued: queues.user.length + queues.warm.length })
  };
}

/* Process-wide state: the logo limiter, resolutions in flight (one per CIK) and a 15-minute memory
 * of finished ones, so an incomplete "none" (which the resolver never caches) is answered null
 * instead of staying pending forever. */
export function createMediaState({ logoConcurrency = 4 } = {}) {
  return { logos: createLimiter(logoConcurrency), running: new Map(), settled: new Map() };
}
const shared = createMediaState();

let photosModule = null, logosModule = null;
const photoApi = () => (photosModule ||= import("./people-photos.mjs"));
const logoApi = () => (logosModule ||= import("./logo-resolver.mjs"));
const DEFAULTS = {
  tickerIndex: () => secTickerIndex(),
  getRecord, hasMedia,
  logoForTicker: async (ticker, options) => (await logoApi()).logoForTicker(ticker, options),
  resolveLogo: async (subject, options) => (await logoApi()).resolveLogo(subject, options),
  // The resolver's current preparation pass (LOGO_PREP, stamped on its records as `prep`), or null
  // while it has none: a logo prepared by an older pass is resolved again instead of served.
  logoPrep: async () => (await logoApi()).LOGO_PREP ?? null,
  requestPhotos: async options => (await photoApi()).requestPhotos(options),
  // -> "queued" | "running" | null for the issuer's photo job; changes nothing.
  photoJob: async cik => (await photoApi()).photoJobStatus(cik),
  // The engine's SEC import (src/api.mjs). null: no database (website preview).
  loadOwners: null,
  loadIssuers: null,
  now: () => Date.now()
};

/* ---------------- logos ---------------- */
const shaFor = variant => mediaSha(variant?.url) || (/^[a-f0-9]{64}$/.test(String(variant?.sha || "")) ? variant.sha : null);
/* {kind:"ok", value} | {kind:"none"} | {kind:"stale"} (chosen, but its bytes are gone or it was
 * prepared by an older pass) | null (unknown) */
async function logoValue(result, name, d, prep = null) {
  if (!result || typeof result !== "object") return null;
  if (result.status === "none") return { kind: "none" };
  if (result.status !== "ok") return null;
  if (prep != null && result.prep !== prep) return { kind: "stale" };
  const v = result.variants || {};
  // Square first (it fills a square tile); a wide wordmark becomes the alternative.
  const main = [v.square, v.wide, ...Object.values(v)].find(x => x?.url);
  if (!main) return { kind: "none" };
  if (!(await d.hasMedia(shaFor(main)))) return { kind: "stale" };
  const value = { src: main.url, w: main.width ?? null, h: main.height ?? null, source: main.source || null, name: name || null };
  const other = main === v.square ? v.wide : null;
  if (other?.url && await d.hasMedia(shaFor(other))) value.alt = { src: other.url, w: other.width ?? null, h: other.height ?? null };
  return { kind: "ok", value };
}
function pruneSettled(state, now) {
  if (state.settled.size > 5000) for (const [k, s] of state.settled) if (s.until <= now) state.settled.delete(k);
}
function startLogo(subject, refresh, ctx) {
  const { d, state, priority, budget, usage, requester } = ctx;
  const current = state.running.get(subject.cik);
  if (current) { if (priority === "user") state.logos.promote(current.job, requester); return current.promise; }
  if (ctx.noStarts || budget.logos <= 0) return null;
  const options = refresh ? { refresh: true } : {};
  const { promise, job, accepted } = state.logos.run(() => subject.ticker ? d.logoForTicker(subject.ticker, options) : d.resolveLogo({ cik: subject.cik }, options), priority, requester);
  if (accepted) { budget.logos--; usage.logos++; }
  const tracked = promise.then(
    result => { state.settled.set(subject.cik, { result: result && typeof result === "object" ? result : null, until: d.now() + SETTLED_MS }); },
    error => {
      if (error?.busy) return;
      console.warn("Logo resolution failed for", subject.ticker || subject.cik, error?.message);
      state.settled.set(subject.cik, { error: true, until: d.now() + ERROR_BACKOFF_MS });
    }).finally(() => { state.running.delete(subject.cik); pruneSettled(state, d.now()); });
  state.running.set(subject.cik, { promise: tracked, job });
  return tracked;
}
/* -> {value} (logo or null) or {pending:true, promise?} */
async function logoFor(subject, ctx) {
  const { d, state } = ctx;
  const record = await d.getRecord("logo", subject.cik).catch(() => null);
  const known = await logoValue(record, subject.name, d, ctx.prep);
  if (known?.kind === "ok") return { value: known.value };
  if (known?.kind === "none") return { value: null };
  const settled = state.settled.get(subject.cik);
  if (settled && settled.until > d.now()) {
    // A resolver error is not "no logo": the page asks again after the back-off.
    if (settled.error) return { pending: true, promise: null };
    // What a resolution just returned is served even if it carries no preparation stamp, so a
    // resolver that does not stamp every record cannot cause a refresh on every request.
    const done = await logoValue(settled.result, subject.name, d);
    if (done?.kind === "ok") return { value: done.value };
    if (!settled.result || done?.kind === "none") return { value: null };
  }
  return { pending: true, promise: startLogo(subject, known?.kind === "stale", ctx) };
}

/* ---------------- photos ---------------- */
const readableName = photo => {
  const n = String(photo?.personName || "").replace(/\s+/g, " ").trim();
  return ["wikimedia", "company-site"].includes(photo?.source) && /[a-z]/.test(n) && n.length >= 3 && n.length <= 48 && !/[,;()]/.test(n) ? n : null;
};
const shapePhoto = (photo, name) => {
  const shown = name || readableName(photo);
  return { src: photo.src, w: PHOTO_SIZE, h: PHOTO_SIZE, source: photo.source || null, credit: photo.credit || null, sourceUrl: photo.sourceUrl || null, ...(shown ? { name: shown } : {}) };
};
/* The issuer a people= entry names: {ticker|null, cik (10 digits), name|null} or null (owner alone, or
 * a ticker the SEC ticker file does not list). An issuer CIK that is listed resolves to its listing. */
function issuerOf(pair, maps) {
  if (pair.ticker) return maps.byTicker.get(pair.ticker) || null;
  if (!pair.issuerCik) return null;
  const listed = maps.byCik.get(pair.issuerCik);
  return (listed && maps.byTicker.get(listed)) || { ticker: null, cik: pad10(pair.issuerCik), name: null };
}
/* What the stored records already say about one owner/issuer pair. */
async function firstLook(pair, maps, d) {
  const k = "cik:" + pair.cik;
  // A listed company filing as an owner (Berkshire Hathaway at OXY): its own logo, never a face.
  const ownTicker = maps.byCik.get(pair.cik);
  if (ownTicker) return { entity: true, ownTicker };
  const issuer = issuerOf(pair, maps);
  const [known, company] = await Promise.all([
    d.getRecord("person-photo", pair.cik).catch(() => null),
    issuer ? d.getRecord("company-photos", issuer.cik).catch(() => null) : null
  ]);
  const name = company?.names?.[k] || null;
  const atCompany = company?.photos?.[k];
  let takedown;
  for (const photo of [known, atCompany]) {
    if (!photo?.src || excludedPhoto(photo)) continue;
    // A takedown keeps the photo off every page even while an older record still names it (and
    // a taken-down photo is never "lost" bytes to look for again).
    takedown ??= Boolean((await d.getRecord("person-photo-override", pair.cik).catch(() => null))?.none);
    if (takedown) return { none: true };
    if (!(await d.hasMedia(mediaSha(photo.src)))) continue;
    return { photo: shapePhoto(photo, name) };
  }
  // No issuer (the owner alone): the person-photo record was the whole answer. Without a usable one
  // nothing was looked for (unlooked: left out of the answer), unless the person is taken down.
  if (!issuer) {
    takedown ??= Boolean((await d.getRecord("person-photo-override", pair.cik).catch(() => null))?.none);
    return takedown ? { none: true } : { none: true, unlooked: true };
  }
  if (company?.entities?.includes(k)) return { entity: true, ownTicker: null };
  // A photo job reads the issuer's SEC listing; one without a ticker has none to run.
  if (!issuer.ticker) return { none: true };
  const complete = Boolean(company?.complete);
  const inRoster = complete && Array.isArray(company.roster) && company.roster.includes(k);
  const lost = Boolean(known?.src || atCompany?.src); // chosen once, but the bytes are gone
  if (inRoster && !lost) return { none: true };
  return { issuer, complete, inRoster, lost };
}
/* rows [{owner_cik, ticker, issuer_cik, owner_name}] -> Map("<cik>:<TICKER>" and "<cik>:cik:<issuer CIK>" -> name) */
function ownerNames(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const cik = cleanCik(row?.owner_cik), ticker = cleanTicker(row?.ticker), issuer = cleanCik(row?.issuer_cik), name = String(row?.owner_name ?? "").replace(/\s+/g, " ").trim();
    if (!cik || !name) continue;
    for (const key of [ticker && cik + ":" + ticker, issuer && cik + ":cik:" + issuer]) if (key && !out.has(key)) out.set(key, name.slice(0, 120));
  }
  return out;
}
// The import's name for one asked pair: by the issuer's ticker or by its CIK, whichever the import has.
const nameFor = (names, p, issuer) => (p.ticker && names.get(p.cik + ":" + p.ticker)) || (issuer?.cik && names.get(p.cik + ":cik:" + cleanCik(issuer.cik))) || null;

/* The answer for one batch. options: priority ("user" | "warm"), requester (who asked: queues
 * share their slots between requesters), maxStarts (new logo resolutions), maxPhotoStarts (new
 * company photo jobs), usage ({logos, photos}: incremented by what this call started, for the
 * caller's per-requester allowance). deps are injectable for tests. */
export async function mediaBatch(q, deps = {}, { priority = "user", requester = null, maxStarts = 20, maxPhotoStarts = 10, usage = null } = {}) {
  const d = { ...DEFAULTS, ...deps };
  const state = deps.state || shared;
  const level = priority === "warm" ? "warm" : "user";
  const ctx = { d, state, priority: level, requester: String(requester || (level === "warm" ? "warm" : "anonymous")).slice(0, 120),
    budget: { logos: Math.max(0, maxStarts), photos: Math.max(0, maxPhotoStarts) }, usage: usage || { logos: 0, photos: 0 }, noStarts: false };
  ctx.usage.logos ||= 0; ctx.usage.photos ||= 0;
  const verified = typeof d.loadOwners === "function";
  const maps = indexMaps(await d.tickerIndex());
  ctx.prep = await Promise.resolve(d.logoPrep?.()).catch(() => null) ?? null;
  const logos = {}, photos = {}, owners = {}, pending = { logos: [], photos: [] }, queuedPairs = new Set();

  // Every company whose logo is answered: requested tickers, ciks, the issuer of every person and
  // listed companies that file as owners.
  const subjects = new Map();
  const addTicker = ticker => {
    if (subjects.has(ticker)) return;
    const rec = maps.byTicker.get(ticker);
    subjects.set(ticker, rec ? { key: ticker, ticker, cik: rec.cik, name: rec.name } : { key: ticker, missing: true });
  };
  for (const t of q.tickers) addTicker(t);
  for (const p of q.people) if (p.ticker) addTicker(p.ticker);
  // Issuers asked for by CIK: ciks= and the issuer of every <owner>:cik:<issuer> entry. One is looked
  // up only when it is listed or the SEC import has filings for it, so a made-up number starts no
  // resolution (and no SEC request).
  const issuerCiks = [...new Set([...q.ciks, ...q.people.map(p => p.issuerCik).filter(Boolean)])];
  const unlisted = issuerCiks.filter(cik => !maps.byCik.has(cik));
  let issuers = new Set(), issuersFailed = false;
  if (unlisted.length && typeof d.loadIssuers === "function") {
    try { issuers = new Set((await d.loadIssuers(unlisted)).map(r => cleanCik(r?.issuer_cik ?? r)).filter(Boolean)); }
    catch (e) { issuersFailed = true; console.warn("Issuer lookup for media failed:", e?.message); }
  }
  for (const cik of issuerCiks) {
    const ticker = maps.byCik.get(cik) || null, rec = ticker ? maps.byTicker.get(ticker) : null;
    if (!ticker && !issuers.has(cik)) { subjects.set("cik:" + cik, { key: "cik:" + cik, missing: true, retry: issuersFailed }); continue; }
    subjects.set("cik:" + cik, { key: "cik:" + cik, ticker, cik: rec?.cik || pad10(cik), name: rec?.name || null, listed: ticker });
  }

  // People, 1: what the records already answer.
  const answers = await Promise.all(q.people.map(p => firstLook(p, maps, d)));
  // 2: one database round trip confirms the owners still to look for, with their filed names.
  const unsure = q.people.map((p, i) => [p, answers[i]]).filter(([, a]) => a.issuer && !a.inRoster);
  let names = new Map(), ownersFailed = false;
  if (unsure.length && verified) {
    try { names = ownerNames(await d.loadOwners(unsure.map(([p, a]) => ({ cik: p.cik, ticker: a.issuer.ticker, issuerCik: cleanCik(a.issuer.cik) })))); }
    catch (e) { ownersFailed = true; console.warn("Owner lookup for media failed:", e?.message); }
  }
  // 3: group the confirmed ones by company and ask the photo queue.
  const groups = new Map(), watching = [];
  q.people.forEach((p, i) => {
    const a = answers[i];
    if (!a.issuer) return;
    const name = nameFor(names, p, a.issuer);
    if (name && isEntityName(name)) { answers[i] = { entity: true, ownTicker: null }; return; }
    if (!a.inRoster && !name) {
      if (ownersFailed) { answers[i] = { pending: true, waitingOn: "owners" }; return; }
      // Not a filer the engine knows at this company: nothing is looked up for them. With a
      // database that holds for every company; a job someone else already started may still
      // put them on its roster, so they wait for it (without changing it).
      if (a.complete) { answers[i] = { none: true }; return; }
      if (verified) { watching.push(i); return; }
      // Website preview (no database): the company's own roster job may start.
    }
    const g = groups.get(a.issuer.cik) || { ticker: a.issuer.ticker, cik: a.issuer.cik, rerun: a.complete, extras: [], keys: [], members: [] };
    if (name) g.extras.push({ cik: p.cik, name });
    if (a.inRoster && a.lost) g.keys.push("cik:" + p.cik);
    g.members.push(i);
    groups.set(a.issuer.cik, g);
  });
  let queued = false;
  const jobs = new Map(); // issuer CIK -> "queued" | "running" | other status of its photo job
  for (const g of groups.values()) {
    const create = !ctx.noStarts && ctx.budget.photos > 0;
    const ticket = await d.requestPhotos({ ticker: g.ticker, cik: g.cik, extra: g.extras, keys: g.keys, priority: ctx.priority, requester: ctx.requester, rerun: g.rerun, create });
    if (ticket?.started) { ctx.budget.photos--; ctx.usage.photos++; }
    const status = ticket?.status || "none";
    jobs.set(g.cik, status);
    if (status === "queued") queued = true;
    for (const i of g.members) {
      if (status === "throttled" || status === "settling") {
        // The job may have just finished: the records decide, and a throttled re-run means no photo for now.
        const again = await firstLook(q.people[i], maps, d);
        answers[i] = again.photo || again.none || again.entity ? again : status === "throttled" ? { none: true } : { pending: true };
      } else answers[i] = { pending: true, queued: status === "queued" };
    }
  }
  for (const i of watching) {
    const cik = answers[i].issuer.cik;
    if (!jobs.has(cik)) jobs.set(cik, await Promise.resolve(d.photoJob(cik)).catch(() => null));
    const job = jobs.get(cik);
    if (job === "queued" || job === "running") { answers[i] = { pending: true, queued: job === "queued" }; if (job === "queued") queued = true; }
    else answers[i] = { none: true };
  }
  // 4: one answer per owner CIK: a photo from any pair wins, then pending, then null. An owner asked
  // only in the owner-alone form with nothing on record (every pair unlooked) is left out.
  const byOwner = new Map();
  q.people.forEach((p, i) => {
    const a = answers[i], o = byOwner.get(p.cik) || { photo: null, entity: null, pending: [], looked: false };
    if (!a.unlooked) o.looked = true;
    if (a.photo && !o.photo) o.photo = a.photo;
    if (a.entity) { o.entity = { entity: true, ticker: a.ownTicker || o.entity?.ticker || null }; if (a.ownTicker) addTicker(a.ownTicker); }
    if (a.pending) { o.pending.push(p.pair); if (a.queued) queuedPairs.add(p.pair); }
    byOwner.set(p.cik, o);
  });
  for (const [cik, o] of byOwner) {
    if (o.entity) { owners[cik] = o.entity; photos[cik] = null; }
    else if (o.photo) photos[cik] = o.photo;
    else if (o.pending.length) pending.photos.push(...o.pending);
    else if (o.looked) photos[cik] = null;
  }

  // Logos (after the people, which can add an owner's own ticker).
  const shape = (subject, value) => value && subject.listed ? { ...value, ticker: subject.listed } : value;
  const inFlight = [];
  const answerLogo = async subject => {
    if (subject.missing) { if (subject.retry) pending.logos.push(subject.key); else logos[subject.key] = null; return; }
    const r = await logoFor(subject, ctx);
    if (r.pending) { pending.logos.push(subject.key); if (r.promise) inFlight.push(r.promise); }
    else logos[subject.key] = shape(subject, r.value);
  };
  await Promise.all([...subjects.values()].map(answerLogo));
  // wait: logos that are already resolving may land in this response.
  if (q.wait > 0 && inFlight.length) {
    await Promise.race([Promise.allSettled(inFlight), sleep(q.wait)]);
    ctx.noStarts = true;
    const again = pending.logos.splice(0);
    await Promise.all(again.map(key => answerLogo(subjects.get(key))));
  }
  pending.logos.sort();
  pending.photos.sort();
  // Each kind has its own hint, so a client paces logos (a second or two) apart from headshots (a
  // photo job that waits its turn takes minutes); retryAfter stays the slowest of the two.
  const retryAfterPhotos = pending.photos.length ? (queued ? 15 : 8) : 0, retryAfterLogos = pending.logos.length ? 3 : 0;
  const retryAfter = retryAfterPhotos || retryAfterLogos;
  // queued: pending pairs whose company job is still waiting for its turn (not running yet), so a
  // client need not count those polls against its patience.
  return { logos, photos, owners, pending, queued: pending.photos.filter(pair => queuedPairs.has(pair)), retryAfter, retryAfterLogos, retryAfterPhotos, invalid: q.invalid || [] };
}
export const mediaPending = body => Boolean(body?.pending?.logos?.length || body?.pending?.photos?.length);

/* loadOwners for GET /v1/media: which of these owner CIKs filed for which of these issuers (by the
 * ticker filed or by issuer CIK), with the name on their latest filing there. Fixtures store
 * "0001214156", filings may say "BRK.B": both spellings of each are asked for, and only exact
 * requested pairs are used (mediaBatch matches rows to pairs). pairs: [{cik, ticker|null, issuerCik|null}].
 * With joint: true (sec_filing_owners exists, sql/008), owners of joint filings (whose lines carry no
 * owner CIK) are confirmed from that table, with the name each owner filed under. */
export const OWNERS_SQL = `SELECT DISTINCT ON (owner_cik, ticker, issuer_cik) owner_cik, ticker, issuer_cik, owner_name FROM sec_transactions
  WHERE owner_cik = ANY($1::text[]) AND (ticker = ANY($2::text[]) OR issuer_cik = ANY($3::text[]))
  ORDER BY owner_cik, ticker, issuer_cik, transaction_date DESC NULLS LAST`;
export const JOINT_OWNERS_SQL = `SELECT DISTINCT ON (o.owner_cik, f.ticker, f.issuer_cik) o.owner_cik, f.ticker, f.issuer_cik, o.owner_name
  FROM sec_filing_owners o JOIN sec_filings f ON f.accession = o.accession
  WHERE o.owner_cik = ANY($1::text[]) AND f.ingest_status = 'parsed' AND (f.ticker = ANY($2::text[]) OR f.issuer_cik = ANY($3::text[]))
  ORDER BY o.owner_cik, f.ticker, f.issuer_cik, f.published_at DESC NULLS LAST`;
export function ownersParams(pairs) {
  const ciks = new Set(), tickers = new Set(), issuers = new Set();
  for (const pair of pairs || []) {
    const cik = cleanCik(pair?.cik), ticker = cleanTicker(pair?.ticker), issuer = cleanCik(pair?.issuerCik);
    if (!cik || (!ticker && !issuer)) continue;
    ciks.add(cik); ciks.add(pad10(cik));
    if (ticker) { tickers.add(ticker); tickers.add(ticker.replace(/-/g, ".")); }
    if (issuer) { issuers.add(issuer); issuers.add(pad10(issuer)); }
  }
  return [[...ciks], [...tickers], [...issuers]];
}
export async function loadOwnersFrom(run, pairs, { joint = false } = {}) {
  const params = ownersParams(pairs);
  if (!params[0].length) return [];
  const rows = (await run(OWNERS_SQL, params)).rows || [];
  return joint ? rows.concat((await run(JOINT_OWNERS_SQL, params)).rows || []) : rows;
}

/* loadIssuers for GET /v1/media: which of these issuer CIKs the SEC import has filings for. */
export const ISSUERS_SQL = `SELECT issuer_cik FROM sec_filings WHERE issuer_cik = ANY($1::text[])
  UNION SELECT issuer_cik FROM sec_transactions WHERE issuer_cik = ANY($1::text[])`;
export async function loadIssuersFrom(run, ciks) {
  const ask = new Set();
  for (const value of ciks || []) { const cik = cleanCik(value); if (cik) { ask.add(cik); ask.add(pad10(cik)); } }
  if (!ask.size) return [];
  return (await run(ISSUERS_SQL, [[...ask]])).rows || [];
}

/* GET /v1/media: the real logo or headshot for every company and person on a page, in one round
 * trip. It answers only from what the resolvers already decided (media_records + stored bytes)
 * and never waits on an upstream source: anything not known yet is listed in `pending` and its
 * resolution starts in bounded background queues (logos here, 4 at a time and at most 20 new per
 * request; photos in the people-photos job queue, 2 companies at a time).
 *
 *   logos[TICKER] / logos["cik:<CIK>"]  {src,w,h,source,name,alt?:{src,w,h}} | null (resolved, none exists)
 *   photos[<owner CIK>]                 {src,w,h,source,credit,sourceUrl,name?} | null
 *   owners[<owner CIK>]                 {entity:true, ticker|null}: a fund or company files there, not a person
 *   pending {logos:[key], photos:["<owner CIK>:<TICKER>"]}, retryAfter (s), invalid [raw entries]
 *
 * Names never come from the request. person-photo records are global by owner CIK, so a name a
 * client typed for someone else's CIK could attach the wrong face to that CIK for every member.
 * A person beyond the SEC's own roster (the issuer's last 16 Form 4 filings) is looked for only
 * when the engine's own SEC import confirms that owner filed for that issuer (loadOwners), and
 * the job gets the name from that import. */
import { tickerIndex as secTickerIndex } from "./intelligence.mjs";
import { getRecord, hasMedia, mediaSha } from "./media-store.mjs";
import { isEntityName } from "./person-match.mjs";

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

/* ?tickers=AAPL,BRK.B&people=1214156:AAPL&ciks=1234567&wait=1200 -> {tickers, people, ciks, wait, invalid}.
 * Throws {status:400} when a list is over its limit or nothing valid is left. */
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
    const m = /^([^:]+):(.+)$/.exec(value);
    const cik = m && cleanCik(m[1]), ticker = m && cleanTicker(m[2]);
    if (!cik || !ticker) { bad(value); continue; }
    const pair = cik + ":" + ticker;
    if (!pairs.has(pair)) { pairs.add(pair); people.push({ cik, ticker, pair }); }
  }
  for (const value of raw.ciks) {
    const cik = cleanCik(value);
    if (!cik) bad(value); else if (!ciks.includes(cik)) ciks.push(cik);
  }
  if (!tickers.length && !people.length && !ciks.length) throw failure(400, "Nothing valid to look up: pass tickers, people (ownerCik:TICKER) or ciks");
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

/* A small priority limiter: "user" work (a page someone is looking at) runs before "warm" work. */
export function createLimiter(concurrency = 4, { maxQueue = 400 } = {}) {
  let active = 0;
  const queues = { user: [], warm: [] };
  const pump = () => {
    while (active < concurrency) {
      const job = queues.user.shift() || queues.warm.shift();
      if (!job) return;
      job.queue = null;
      active++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  };
  return {
    run(fn, priority = "user") {
      const job = { fn };
      const promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
      if (queues.user.length + queues.warm.length >= maxQueue) { job.reject(Object.assign(new Error("Logo queue is full"), { busy: true })); return { promise, job }; }
      job.queue = priority === "warm" ? "warm" : "user";
      queues[job.queue].push(job);
      pump();
      return { promise, job };
    },
    promote(job) {
      if (job?.queue !== "warm") return;
      queues.warm.splice(queues.warm.indexOf(job), 1);
      job.queue = "user";
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
  requestPhotos: async options => (await photoApi()).requestPhotos(options),
  loadOwners: async () => [],
  now: () => Date.now()
};

/* ---------------- logos ---------------- */
const shaFor = variant => mediaSha(variant?.url) || (/^[a-f0-9]{64}$/.test(String(variant?.sha || "")) ? variant.sha : null);
/* {kind:"ok", value} | {kind:"none"} | {kind:"stale"} (chosen, but its bytes are gone) | null (unknown) */
async function logoValue(result, name, d) {
  if (!result || typeof result !== "object") return null;
  if (result.status === "none") return { kind: "none" };
  if (result.status !== "ok") return null;
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
  const { d, state, priority, budget } = ctx;
  const current = state.running.get(subject.cik);
  if (current) { if (priority === "user") state.logos.promote(current.job); return current.promise; }
  if (budget.logos <= 0) return null;
  budget.logos--;
  const options = refresh ? { refresh: true } : {};
  const { promise, job } = state.logos.run(() => subject.ticker ? d.logoForTicker(subject.ticker, options) : d.resolveLogo({ cik: subject.cik }, options), priority);
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
  const known = await logoValue(record, subject.name, d);
  if (known?.kind === "ok") return { value: known.value };
  if (known?.kind === "none") return { value: null };
  const settled = state.settled.get(subject.cik);
  if (settled && settled.until > d.now()) {
    // A resolver error is not "no logo": the page asks again after the back-off.
    if (settled.error) return { pending: true, promise: null };
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
/* What the stored records already say about one owner/issuer pair. */
async function firstLook(pair, maps, d) {
  const k = "cik:" + pair.cik;
  // A listed company filing as an owner (Berkshire Hathaway at OXY): its own logo, never a face.
  const ownTicker = maps.byCik.get(pair.cik);
  if (ownTicker) return { entity: true, ownTicker };
  const issuer = maps.byTicker.get(pair.ticker) || null;
  const [known, company] = await Promise.all([
    d.getRecord("person-photo", pair.cik).catch(() => null),
    issuer ? d.getRecord("company-photos", issuer.cik).catch(() => null) : null
  ]);
  const name = company?.names?.[k] || null;
  const atCompany = company?.photos?.[k];
  for (const photo of [known, atCompany]) {
    if (!photo?.src || !(await d.hasMedia(mediaSha(photo.src)))) continue;
    // A takedown keeps the photo off every page even while an older record still names it.
    if ((await d.getRecord("person-photo-override", pair.cik).catch(() => null))?.none) return { none: true };
    return { photo: shapePhoto(photo, name) };
  }
  if (!issuer) return { none: true };
  if (company?.entities?.includes(k)) return { entity: true, ownTicker: null };
  const complete = Boolean(company?.complete);
  const inRoster = complete && Array.isArray(company.roster) && company.roster.includes(k);
  const lost = Boolean(known?.src || atCompany?.src); // chosen once, but the bytes are gone
  if (inRoster && !lost) return { none: true };
  return { issuer, complete, inRoster, lost };
}
/* rows [{owner_cik, ticker, owner_name}] -> Map("<cik>:<TICKER>" -> name) */
function ownerNames(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const cik = cleanCik(row?.owner_cik), ticker = cleanTicker(row?.ticker), name = String(row?.owner_name ?? "").replace(/\s+/g, " ").trim();
    if (cik && ticker && name && !out.has(cik + ":" + ticker)) out.set(cik + ":" + ticker, name.slice(0, 120));
  }
  return out;
}

/* The answer for one batch. options: priority ("user" | "warm"), maxStarts (new logo resolutions),
 * maxPhotoStarts (new company photo jobs). deps are injectable for tests. */
export async function mediaBatch(q, deps = {}, { priority = "user", maxStarts = 20, maxPhotoStarts = 10 } = {}) {
  const d = { ...DEFAULTS, ...deps };
  const state = deps.state || shared;
  const ctx = { d, state, priority: priority === "warm" ? "warm" : "user", budget: { logos: maxStarts, photos: maxPhotoStarts } };
  const maps = indexMaps(await d.tickerIndex());
  const logos = {}, photos = {}, owners = {}, pending = { logos: [], photos: [] };

  // Every company whose logo is answered: requested tickers, ciks, the issuer of every person and
  // listed companies that file as owners.
  const subjects = new Map();
  const addTicker = ticker => {
    if (subjects.has(ticker)) return;
    const rec = maps.byTicker.get(ticker);
    subjects.set(ticker, rec ? { key: ticker, ticker, cik: rec.cik, name: rec.name } : { key: ticker, missing: true });
  };
  for (const t of q.tickers) addTicker(t);
  for (const p of q.people) addTicker(p.ticker);
  for (const cik of q.ciks) {
    const ticker = maps.byCik.get(cik) || null, rec = ticker ? maps.byTicker.get(ticker) : null;
    subjects.set("cik:" + cik, { key: "cik:" + cik, ticker, cik: rec?.cik || pad10(cik), name: rec?.name || null, listed: ticker });
  }

  // People, 1: what the records already answer.
  const answers = await Promise.all(q.people.map(p => firstLook(p, maps, d)));
  // 2: one database round trip confirms the owners still to look for, with their filed names.
  const unsure = q.people.filter((p, i) => answers[i].issuer && !answers[i].inRoster);
  let names = new Map(), ownersFailed = false;
  if (unsure.length) {
    try { names = ownerNames(await d.loadOwners(unsure.map(({ cik, ticker }) => ({ cik, ticker })))); }
    catch (e) { ownersFailed = true; console.warn("Owner lookup for media failed:", e?.message); }
  }
  // 3: group the rest by company and ask the photo queue.
  const groups = new Map();
  q.people.forEach((p, i) => {
    const a = answers[i];
    if (!a.issuer) return;
    const name = names.get(p.cik + ":" + p.ticker);
    if (name && isEntityName(name)) { answers[i] = { entity: true, ownTicker: null }; return; }
    if (a.complete && !a.inRoster) {
      if (ownersFailed) { answers[i] = { pending: true, waitingOn: "owners" }; return; }
      // Not a filer the engine knows at this company: nothing is looked up for them.
      if (!name) { answers[i] = { none: true }; return; }
    }
    const g = groups.get(a.issuer.cik) || { ticker: p.ticker, cik: a.issuer.cik, rerun: a.complete, extras: [], keys: [], members: [] };
    if (name) g.extras.push({ cik: p.cik, name });
    if (a.inRoster && a.lost) g.keys.push("cik:" + p.cik);
    g.members.push(i);
    groups.set(a.issuer.cik, g);
  });
  let queued = false;
  for (const g of groups.values()) {
    const create = ctx.budget.photos > 0;
    const ticket = await d.requestPhotos({ ticker: g.ticker, cik: g.cik, extra: g.extras, keys: g.keys, priority: ctx.priority, rerun: g.rerun, create });
    if (ticket?.started) ctx.budget.photos--;
    const status = ticket?.status || "none";
    if (status === "queued") queued = true;
    for (const i of g.members) {
      if (status === "throttled" || status === "settling") {
        // The job may have just finished: the records decide, and a throttled re-run means no photo for now.
        const again = await firstLook(q.people[i], maps, d);
        answers[i] = again.photo || again.none || again.entity ? again : status === "throttled" ? { none: true } : { pending: true };
      } else answers[i] = { pending: true };
    }
  }
  // 4: one answer per owner CIK: a photo from any pair wins, then pending, then null.
  const byOwner = new Map();
  q.people.forEach((p, i) => {
    const a = answers[i], o = byOwner.get(p.cik) || { photo: null, entity: null, pending: [] };
    if (a.photo && !o.photo) o.photo = a.photo;
    if (a.entity) { o.entity = { entity: true, ticker: a.ownTicker || o.entity?.ticker || null }; if (a.ownTicker) addTicker(a.ownTicker); }
    if (a.pending) o.pending.push(p.pair);
    byOwner.set(p.cik, o);
  });
  for (const [cik, o] of byOwner) {
    if (o.entity) { owners[cik] = o.entity; photos[cik] = null; }
    else if (o.photo) photos[cik] = o.photo;
    else if (o.pending.length) pending.photos.push(...o.pending);
    else photos[cik] = null;
  }

  // Logos (after the people, which can add an owner's own ticker).
  const shape = (subject, value) => value && subject.listed ? { ...value, ticker: subject.listed } : value;
  const inFlight = [];
  const answerLogo = async subject => {
    if (subject.missing) { logos[subject.key] = null; return; }
    const r = await logoFor(subject, ctx);
    if (r.pending) { pending.logos.push(subject.key); if (r.promise) inFlight.push(r.promise); }
    else logos[subject.key] = shape(subject, r.value);
  };
  await Promise.all([...subjects.values()].map(answerLogo));
  // wait: logos that are already resolving may land in this response.
  if (q.wait > 0 && inFlight.length) {
    await Promise.race([Promise.allSettled(inFlight), sleep(q.wait)]);
    ctx.budget.logos = 0;
    const again = pending.logos.splice(0);
    await Promise.all(again.map(key => answerLogo(subjects.get(key))));
  }
  pending.logos.sort();
  pending.photos.sort();
  const retryAfter = pending.photos.length ? (queued ? 15 : 8) : pending.logos.length ? 3 : 0;
  return { logos, photos, owners, pending, retryAfter, invalid: q.invalid || [] };
}
export const mediaPending = body => Boolean(body?.pending?.logos?.length || body?.pending?.photos?.length);

/* loadOwners for GET /v1/media: which of these owner CIKs filed for which of these issuers, with
 * the name on their latest filing. Fixtures store "0001214156", filings may say "BRK.B": both
 * spellings of each are asked for, and only exact requested pairs are used. */
export const OWNERS_SQL = `SELECT DISTINCT ON (owner_cik, ticker) owner_cik, ticker, owner_name FROM sec_transactions
  WHERE owner_cik = ANY($1::text[]) AND ticker = ANY($2::text[])
  ORDER BY owner_cik, ticker, transaction_date DESC NULLS LAST`;
export function ownersParams(pairs) {
  const ciks = new Set(), tickers = new Set();
  for (const pair of pairs || []) {
    const cik = cleanCik(pair?.cik), ticker = cleanTicker(pair?.ticker);
    if (!cik || !ticker) continue;
    ciks.add(cik); ciks.add(pad10(cik));
    tickers.add(ticker); tickers.add(ticker.replace(/-/g, "."));
  }
  return [[...ciks], [...tickers]];
}
export async function loadOwnersFrom(run, pairs) {
  const [ciks, tickers] = ownersParams(pairs);
  if (!ciks.length || !tickers.length) return [];
  return (await run(OWNERS_SQL, [ciks, tickers])).rows || [];
}

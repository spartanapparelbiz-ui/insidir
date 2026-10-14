/* Real photos for the people on a company report, from the strongest sources first:
 *  1. Wikidata/Commons people linked to the company (free licence, statement-level tie)
 *  2. the company's own leadership and board pages (verified domain, one image per card)
 *  3. headshots printed in the company's SEC proxy statement (DEF 14A)
 * Every match goes through the strict person matcher and must be tied to this company; a name
 * alone never attaches a photo. People without a verified photo keep their initials: no
 * generated or guessed faces. A verified photo is reused wherever the same SEC reporting owner
 * (by CIK) appears. Work runs in the background and the page receives results as they land. */
import { fetchImage, imageSize } from "./media.mjs";
import { preparePhoto } from "./image-analysis.mjs";
import { putMedia, getMedia, getRecord, putRecord } from "./media-store.mjs";
import { isEntityName, samePerson, nameTokens } from "./person-match.mjs";
import { resolveCompany, tickerIndex } from "./intelligence.mjs";
import { getCompanyInsiders, ownerIssuers } from "./insiders.mjs";

const DAY = 86400000;
const PUBLIC_UA = "InsidirResearch/1.0 (+spartanapparelbiz@gmail.com)";
/* A caption or card name ("Suzanne Nora Johnson, Director") as a display name, only when it is the
 * same person as the SEC filer name. */
const NAME_RANK = { wikimedia: 3, "company-site": 2, "sec-proxy": 1 };
const titleWord = w => w.toLowerCase().replace(/(^|['’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/^Mc(\p{L})/u, (m, c) => "Mc" + c.toUpperCase());
const wordKey = w => w.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
const captionName = (secName, caption) => {
  let name = String(caption || "").split(/,|\s[–—-]\s|\bAge\b|\n/)[0].replace(/\s+/g, " ").trim();
  if (name.length < 4 || name.length > 48) return null;
  // Proxies print captions in capitals, and proxy captions arrive folded to lower case without
  // apostrophes or accents: each word takes the filer's own spelling when the letters agree
  // (O'BRIEN, not "Obrien").
  if (!/[a-z]/.test(name) || !/[A-Z]/.test(name)) {
    const filed = new Map(String(secName || "").split(/\s+/).filter(Boolean).map(w => [wordKey(w), w]));
    name = name.split(" ").map(w => titleWord(filed.get(wordKey(w)) || w)).join(" ");
  }
  return samePerson(secName, name) ? name : null;
};
const siteHost = url => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const COMPANY_TTL = 7 * DAY, PERSON_TTL = 90 * DAY;
const jobs = new Map();
// The browser computes the same key: owner CIK when the filing has one, else the normalized name.
const keyFor = person => person.cik ? "cik:" + String(person.cik).replace(/^0+/, "") : "name:" + String(person.name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
const optional = async path => { try { return await import(path); } catch (e) { if (!/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(e?.code || e?.message))) console.warn("Photo source unavailable:", path, e?.message); return null; } };

async function store(bytes, type) {
  const prepared = await preparePhoto(bytes, type, 256);
  return putMedia(prepared);
}
/* Commons portraits that are full-length or tiny are passed over for a better source. Company
 * sites get the page as Referer (many refuse hotlinked images without it). */
async function fromUrl(url, { referer, userAgent = "InsidirResearch/1.0 (spartanapparelbiz@gmail.com)" } = {}) {
  const image = await politeImage(url, { maxBytes: 4_000_000, timeoutMs: 15000, userAgent, headers: referer ? { Referer: referer } : {} });
  if (!["png", "jpeg", "webp", "gif", "avif"].includes(image.type)) throw new Error("Not a photo");
  return { saved: await store(image.bytes, image.type), size: imageSize(image.bytes, image.type) };
}
/* Wikimedia throttles bursts of thumbnail requests (HTTP 429), and every company's job fetches
 * from it: one request at a time per host with a short gap, and a 429/503 waits out
 * Retry-After (bounded) before retrying. A failure that may be temporary is marked so the
 * company's result expires soon and is tried again. */
const imageLanes = new Map();
const IMAGE_GAP = { "upload.wikimedia.org": 400 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const transientImageError = e => [429, 500, 502, 503, 504].includes(e?.upstreamStatus) || /abort|timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(e?.name) + " " + String(e?.message));
async function politeImage(url, options) {
  let host = "";
  try { host = new URL(url).hostname; } catch { /* fetchImage rejects it */ }
  const gap = IMAGE_GAP[host];
  if (!gap) return fetchImage(url, options);
  const lane = imageLanes.get(host) || { tail: Promise.resolve(), next: 0 };
  imageLanes.set(host, lane);
  const run = lane.tail.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = lane.next - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await fetchImage(url, options); }
      catch (e) {
        if (attempt >= 2 || ![429, 503].includes(e?.upstreamStatus)) throw e;
        const seconds = Math.min(30, Math.max(2, Number(e.retryAfter) || 5 * (attempt + 1)));
        lane.next = Date.now() + seconds * 1000;
      } finally { lane.next = Math.max(lane.next, Date.now() + gap); }
    }
  });
  lane.tail = run.catch(() => {});
  return run;
}
/* Landscape or small Commons pictures often show the person small (at a podium, on a stage). */
const weakPicture = size => Boolean(size && (size.width / size.height > 1.15 || Math.min(size.width, size.height) < 200));
/* Such a picture is used at all only when its Commons file is named after the person and does not
 * read like a group shot: Wikidata's image for one director was "2009 Secretary of State's Award
 * for Corporate Excellence.jpg", six people in a row. */
const GROUP_FILE = /\b(and|with|meets?|meeting|visits?|group|panel|delegation|team|award|ceremony|family|members)\b|&/i;
function usableWeak(photo, name) {
  const file = String(photo?.file || decodeURIComponent(String(photo?.source || "").split("File:").pop() || "")).replace(/_/g, " ");
  const surname = nameTokens(name).at(-1);
  const folded = file.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]+/g, " ");
  return Boolean(surname && surname.length >= 2 && (" " + folded + " ").includes(" " + surname + " ") && !GROUP_FILE.test(file.replace(/\.[a-z]+$/i, "")));
}
/* Alt text or a file name can name a person by surname alone ("nominee_smith.jpg", "CarneyL");
 * those medium-confidence pairings are not used: surname plus given name, always. */
const fullNameEvidence = m => !(["alt", "alt-adjacent"].includes(m.rule) && m.confidence !== "high");
/* A proxy match carries an already prepared photo; it is used only while its bytes are still
 * stored, otherwise the original portrait is prepared again. */
async function proxyPhoto(m) {
  if (m.sha && m.photoUrl && await getMedia(m.sha)) return m.photoUrl;
  if (m.bytes) return (await store(m.bytes, m.type)).url;
  return null;
}

function publish(state) {
  state.updatedAt = new Date().toISOString();
  // A run where a source or image failed temporarily is redone after half an hour.
  const ttl = !state.complete ? 10 * 60 * 1000 : state.transient ? 30 * 60 * 1000 : COMPANY_TTL;
  return putRecord("company-photos", state.cik, state, ttl);
}

async function runJob(ticker, company) {
  const state = { cik: company.cik, ticker, complete: false, photos: {}, names: {}, leaders: [], sources: {}, startedAt: new Date().toISOString() };
  const insiders = (await getCompanyInsiders(ticker).catch(() => null))?.people || [];
  const people = insiders.filter(p => p?.name && !isEntityName(p.name)).map(p => ({ ...p, key: keyFor(p) }));
  const pending = () => people.filter(p => !state.photos[p.key]);
  // Display names: Wikidata labels and company-site cards keep their own casing ("LaVerne"); proxy
  // captions arrive folded and are only title-cased, so they rank last.
  const nameRank = {};
  const setName = (person, name, rank) => {
    if (!name || (nameRank[person.key] || 0) >= rank) return;
    state.names[person.key] = name;
    nameRank[person.key] = rank;
  };
  const assign = async (person, photo, { replace = false } = {}) => {
    if (state.photos[person.key] && !replace) return;
    state.photos[person.key] = photo;
    setName(person, captionName(person.name, photo.caption || photo.personName), NAME_RANK[photo.source] || 1);
    if (person.cik) await putRecord("person-photo", String(person.cik).replace(/^0+/, ""), photo, PERSON_TTL);
  };

  // Reuse: a person verified at any company keeps that photo everywhere they file.
  for (const person of people) {
    if (!person.cik) continue;
    const known = await getRecord("person-photo", String(person.cik).replace(/^0+/, ""));
    if (known?.src) state.photos[person.key] = { ...known, reused: true };
  }
  await publish(state);

  // 1. Wikidata / Commons.
  const wikidata = await optional("./wikidata-people.mjs");
  let leaders = [];
  if (wikidata?.wikidataPhotos) {
    try {
      const result = await wikidata.wikidataPhotos({ cik: company.cik, companyName: company.name, insiders: people });
      state.sources.wikidata = { status: result.complete === false ? "partial" : "ok", matched: result.matches?.length || 0 };
      if (result.complete === false) state.transient = true;
      for (const m of result.matches || []) {
        const person = people.find(p => p.key === keyFor({ cik: m.ownerCik, name: m.ownerName || m.personName }) || (m.ownerCik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, "")));
        // The Wikidata name reads better than the filing ("NORA JOHNSON SUZANNE M"), photo or not.
        if (person && m.personName && !/^Q\d+$/.test(m.personName)) setName(person, m.personName, 3);
        if (!person || state.photos[person.key] || !m.photo?.src) continue;
        try {
          const { saved, size } = await fromUrl(m.photo.large || m.photo.src);
          if (weakPicture(size) && !usableWeak(m.photo, m.personName)) continue;
          // A landscape or tiny Commons picture (someone small at a podium) is shown for now, but a
          // headshot from the company's page or proxy replaces it.
          await assign(person, { src: saved.url, source: "wikimedia", sourceUrl: m.photo.source || m.photo.src, credit: m.photo.credit || "Wikimedia Commons", personName: m.personName, rule: m.rule || "wikidata", confidence: "high", ...(weakPicture(size) ? { weak: true } : {}) });
        } catch (e) { if (transientImageError(e)) state.transient = true; /* other sources may still cover this person */ }
      }
      leaders = result.leaders || [];
    } catch (e) { state.transient = true; state.sources.wikidata = { status: "error", message: String(e?.message || e).slice(0, 120) }; }
  }
  await publish(state);

  // Leadership without Form 4 filings (founders, chair, directors) for the People tab, with their
  // Commons portrait when they have one; the company's page and the proxy fill the gaps below.
  for (const leader of leaders) {
    // Wikidata keeps some roles open after people leave; its own description often says so
    // ("former CEO of Yum! Brands"). Founders stay listed as founders.
    if (/\bformer\b/i.test(leader.description || "") && !(leader.roles || []).includes("Founder")) continue;
    let photo = null;
    if (leader.photo?.src) {
      try {
        const { saved, size } = await fromUrl(leader.photo.large || leader.photo.src);
        if (weakPicture(size) && !usableWeak(leader.photo, leader.name)) throw Object.assign(new Error("group or distant picture"), { skip: true });
        photo = { src: saved.url, source: "wikimedia", sourceUrl: leader.photo.source, credit: leader.photo.credit || "Wikimedia Commons", weak: weakPicture(size) };
      } catch (e) { if (transientImageError(e)) state.transient = true; /* the page or proxy may still have one */ }
    }
    state.leaders.push({ key: "wd:" + (leader.qid || leader.name), name: leader.name, qid: leader.qid || null, roles: leader.roles || [], current: leader.current !== false,
      wikidataUrl: leader.wikidataUrl || null, src: photo?.src || null, source: photo?.source || null, sourceUrl: photo?.sourceUrl || null, credit: photo?.credit || null, ...(photo?.weak ? { weak: true } : {}),
      insider: people.some(p => samePerson(p.name, leader.name, leader.aliases || [])) });
  }
  await publish(state);

  // 2 and 3 run together and each is applied as soon as it finishes; the company's own page
  // replaces a proxy picture when both match the same person (larger, current portraits).
  const extraPeople = leaders.filter(l => l?.name).map(l => ({ name: l.name, key: "wd:" + (l.qid || l.name), aliases: l.aliases || [] }));
  const [sitesModule, proxyModule] = await Promise.all([optional("./leader-pages.mjs"), optional("./proxy-headshots.mjs")]);
  // Both sources see the whole roster: a caption or card is accepted only when it names exactly one
  // known person, so leaving out people who already have a photo would weaken that check.
  const roster = people.map(({ name, cik, role, key }) => ({ name, cik, role, key }));
  const need = [...people.filter(p => !state.photos[p.key] || state.photos[p.key].weak).map(p => p.key), ...state.leaders.filter(l => !l.src || l.weak).map(l => l.key)];
  const failed = e => ({ status: "error", message: String(e?.message || e).slice(0, 120), matches: [] });
  const personFor = m => people.find(p => (m.key && p.key === m.key) || (m.ownerCik && p.cik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, "")));
  const leaderFor = m => m.key?.startsWith("wd:") ? state.leaders.find(l => l.key === m.key) : null;
  // The company's own page beats a proxy picture and a weak Commons one; a proxy beats a weak one.
  const replaceable = current => !current || current.source === "sec-proxy" || current.weak;
  const proxyReplaceable = current => !current || current.weak;
  const leaderPhoto = (leader, photo) => { Object.assign(leader, { src: photo.src, source: photo.source, sourceUrl: photo.sourceUrl, credit: photo.credit }); delete leader.weak; };

  const applySite = async site => {
    if (site.status === "error") state.transient = true;
    state.sources.companySite = { status: site.status, matched: site.matches?.length || 0, pages: (site.pages || []).slice(0, 5), ...(site.message ? { message: site.message } : {}) };
    for (const m of site.matches || []) {
      const person = personFor(m), leader = person ? null : leaderFor(m);
      if (person ? !replaceable(state.photos[person.key]) : !leader || !replaceable(leader.src ? leader : null)) continue;
      try {
        const { saved } = await fromUrl(m.imageUrl, { referer: m.pageUrl, userAgent: PUBLIC_UA });
        const photo = { src: saved.url, source: "company-site", sourceUrl: m.pageUrl, credit: "Company website" + (siteHost(m.pageUrl) ? " (" + siteHost(m.pageUrl) + ")" : ""), personName: m.cardName || m.personName, rule: m.rule, confidence: m.confidence || "high" };
        if (person) await assign(person, photo, { replace: true });
        else leaderPhoto(leader, photo);
      } catch (e) { if (transientImageError(e)) state.transient = true; /* try the next source */ }
    }
    await publish(state);
  };
  const applyProxy = async proxy => {
    if (proxy.status === "error") state.transient = true;
    // Wikidata often keeps former directors without an end date. When this year's proxy was read
    // and never names a board-only leader, that person is no longer on the board.
    if (Array.isArray(proxy.mentioned) && (proxy.status === "ok" || proxy.status === "none")) {
      const named = new Set(proxy.mentioned), considered = new Set(proxy.considered || []);
      const boardOnly = l => l.roles.length && l.roles.every(r => /^(Board member|Director \/ manager|Chairperson)$/.test(r));
      const before = state.leaders.length;
      state.leaders = state.leaders.filter(l => !boardOnly(l) || !considered.has(l.key) || named.has(l.key));
      if (state.leaders.length < before) state.sources.secProxy = { ...state.sources.secProxy, formerDirectorsHidden: before - state.leaders.length };
    }
    state.sources.secProxy = { ...(state.sources.secProxy || {}), status: proxy.status, matched: proxy.matches?.length || 0, accession: proxy.accession || null, ...(proxy.message ? { message: proxy.message } : {}) };
    const credit = "SEC proxy statement (DEF 14A" + (proxy.filedAt ? ", filed " + proxy.filedAt : "") + ")";
    for (const m of proxy.matches || []) {
      const person = personFor(m), leader = person ? null : leaderFor(m);
      if (!fullNameEvidence(m)) continue;
      if (person ? !proxyReplaceable(state.photos[person.key]) : !leader || !proxyReplaceable(leader.src ? leader : null)) continue;
      const src = await proxyPhoto(m).catch(() => null);
      if (!src) continue;
      if (person) await assign(person, { src, source: "sec-proxy", sourceUrl: proxy.documentUrl, credit, personName: m.personName || m.caption, caption: m.caption || null, rule: m.rule, confidence: m.confidence || "high" }, { replace: true });
      else leaderPhoto(leader, { src, source: "sec-proxy", sourceUrl: proxy.documentUrl, credit });
    }
    await publish(state);
  };
  // Applied one after the other so the two never write the same person at once.
  let applying = Promise.resolve();
  const queueApply = (fn, result) => { applying = applying.then(() => fn(result)).catch(e => console.warn("Photo source apply failed:", e?.message)); return applying; };
  if (need.length) await Promise.all([
    sitesModule?.leadershipPhotos ? sitesModule.leadershipPhotos({ cik: company.cik, name: company.name, ticker, insiders: roster, extraPeople, need }).catch(failed).then(r => queueApply(applySite, r)) : null,
    proxyModule?.proxyHeadshots ? proxyModule.proxyHeadshots({ cik: company.cik, insiders: roster, extraPeople }).catch(failed).then(r => queueApply(applyProxy, r)) : null
  ]);
  await applying;

  // 4. Other boards: most directors also sit on other companies' boards, and those proxies often
  // print a captioned headshot. The SEC owner CIK ties the person to those filings; the portrait
  // must still be captioned with their name there (high-confidence rules only), with that
  // company's own insiders in the dictionary so a neighbour's caption is never borrowed.
  if (proxyModule?.proxyHeadshots) {
    let found = 0;
    try {
      const { errors } = await otherBoards(company, people.filter(p => p.cik && (!state.photos[p.key] || state.photos[p.key].weak)), proxyModule, async (person, photo) => { found++; await assign(person, photo, { replace: true }); await publish(state); });
      if (errors) state.transient = true;
      state.sources.otherBoards = { status: found ? "ok" : errors ? "partial" : "none", matched: found, ...(errors ? { errors } : {}) };
    }
    catch (e) { state.transient = true; state.sources.otherBoards = { status: "error", message: String(e?.message || e).slice(0, 120) }; }
  }

  state.complete = true;
  state.coverage = { people: people.length, withPhoto: people.filter(p => state.photos[p.key]).length };
  await publish(state);
  return state;
}

const OTHER_PEOPLE = 10, OTHER_ISSUERS_PER_PERSON = 2, OTHER_ISSUERS = 5;
const STRONG_RULES = new Set(["alt", "after", "run", "before-profile"]);
async function otherBoards(company, persons, proxyModule, assign) {
  const index = await tickerIndex();
  const tickerOf = new Map();
  for (const r of Object.values(index || {})) {
    const id = String(r?.cik_str || "");
    if (/^\d{1,10}$/.test(id) && r.ticker && !tickerOf.has(id.padStart(10, "0"))) tickerOf.set(id.padStart(10, "0"), String(r.ticker).toUpperCase());
  }
  const issuers = new Map(); // issuer CIK -> {ticker, name, persons}
  let errors = 0;
  for (const person of persons.slice(0, OTHER_PEOPLE)) {
    const list = (await ownerIssuers(person.cik).catch(() => { errors++; return []; })).filter(x => x.cik !== company.cik && tickerOf.has(x.cik)).slice(0, OTHER_ISSUERS_PER_PERSON);
    for (const x of list) {
      if (!issuers.has(x.cik) && issuers.size >= OTHER_ISSUERS) continue;
      const entry = issuers.get(x.cik) || { ticker: tickerOf.get(x.cik), name: x.name, persons: [] };
      entry.persons.push(person);
      issuers.set(x.cik, entry);
    }
  }
  for (const [cik, issuer] of issuers) {
    const waiting = issuer.persons.filter(p => !p.otherBoardPhoto);
    if (!waiting.length) continue;
    const roster = ((await getCompanyInsiders(issuer.ticker).catch(() => null))?.people || []).filter(p => p?.name && !isEntityName(p.name))
      .map(p => ({ name: p.name, cik: p.cik, role: p.role, key: keyFor(p) }));
    for (const p of waiting) if (!roster.some(r => r.key === p.key)) roster.push({ name: p.name, cik: p.cik, role: p.role, key: p.key });
    const result = await proxyModule.proxyHeadshots({ cik, insiders: roster }).catch(() => null);
    if (!result || result.status === "error") errors++;
    for (const m of result?.matches || []) {
      const person = waiting.find(p => m.ownerCik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, ""));
      if (!person || person.otherBoardPhoto || m.confidence !== "high" || !STRONG_RULES.has(m.rule)) continue;
      const src = await proxyPhoto(m).catch(() => null);
      if (!src) continue;
      person.otherBoardPhoto = true;
      await assign(person, { src, source: "sec-proxy", sourceUrl: result.documentUrl,
        credit: "SEC proxy statement of " + issuer.name + " (DEF 14A" + (result.filedAt ? ", filed " + result.filedAt : "") + ")",
        personName: m.personName || m.caption, caption: m.caption || null, rule: "other-board:" + m.rule, confidence: "high" });
    }
  }
  for (const p of persons) delete p.otherBoardPhoto;
  return { errors };
}

/* Returns what is known now; starts or continues the background job. wait (ms) lets a caller
 * hold briefly for fast sources. */
export async function companyPhotos(ticker, { wait = 0 } = {}) {
  const resolved = await resolveCompany(ticker);
  if (!resolved) return null;
  const { company } = resolved;
  const cached = await getRecord("company-photos", company.cik);
  if (cached?.complete) return cached;
  if (!jobs.has(company.cik)) {
    const job = runJob(ticker, company).catch(e => { console.warn("Photo job failed for", ticker, e?.message); return null; })
      .finally(() => setTimeout(() => jobs.delete(company.cik), 5000).unref?.());
    jobs.set(company.cik, job);
  }
  if (wait > 0) await Promise.race([jobs.get(company.cik), new Promise(r => setTimeout(r, wait))]);
  return (await getRecord("company-photos", company.cik)) || { cik: company.cik, ticker, complete: false, photos: {}, leaders: [], sources: {} };
}
export { keyFor as photoKey };

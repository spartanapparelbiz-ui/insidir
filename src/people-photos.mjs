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
import { isEntityName, samePerson } from "./person-match.mjs";
import { resolveCompany } from "./intelligence.mjs";
import { getCompanyInsiders } from "./insiders.mjs";

const DAY = 86400000;
const PUBLIC_UA = "InsidirResearch/1.0 (+spartanapparelbiz@gmail.com)";
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
  const image = await fetchImage(url, { maxBytes: 4_000_000, timeoutMs: 15000, userAgent, headers: referer ? { Referer: referer } : {} });
  if (!["png", "jpeg", "webp", "gif"].includes(image.type)) throw new Error("Not a photo");
  return { saved: await store(image.bytes, image.type), size: imageSize(image.bytes, image.type) };
}
/* A proxy match carries an already prepared photo; it is used only while its bytes are still
 * stored, otherwise the original portrait is prepared again. */
async function proxyPhoto(m) {
  if (m.sha && m.photoUrl && await getMedia(m.sha)) return m.photoUrl;
  if (m.bytes) return (await store(m.bytes, m.type)).url;
  return null;
}

function publish(state) {
  state.updatedAt = new Date().toISOString();
  return putRecord("company-photos", state.cik, state, state.complete ? COMPANY_TTL : 10 * 60 * 1000);
}

async function runJob(ticker, company) {
  const state = { cik: company.cik, ticker, complete: false, photos: {}, leaders: [], sources: {}, startedAt: new Date().toISOString() };
  const insiders = (await getCompanyInsiders(ticker).catch(() => null))?.people || [];
  const people = insiders.filter(p => p?.name && !isEntityName(p.name)).map(p => ({ ...p, key: keyFor(p) }));
  const pending = () => people.filter(p => !state.photos[p.key]);
  const assign = async (person, photo, { replace = false } = {}) => {
    if (state.photos[person.key] && !replace) return;
    state.photos[person.key] = photo;
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
      state.sources.wikidata = { status: "ok", matched: result.matches?.length || 0 };
      for (const m of result.matches || []) {
        const person = people.find(p => p.key === keyFor({ cik: m.ownerCik, name: m.ownerName || m.personName }) || (m.ownerCik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, "")));
        if (!person || state.photos[person.key] || !m.photo?.src) continue;
        try {
          const { saved, size } = await fromUrl(m.photo.large || m.photo.src);
          // Prefer another source over a full-length or tiny Commons picture.
          if (size && (size.width / size.height > 1.6 || Math.min(size.width, size.height) < 200)) { person.commonsFallback = { saved, m }; continue; }
          await assign(person, { src: saved.url, source: "wikimedia", sourceUrl: m.photo.source || m.photo.src, credit: m.photo.credit || "Wikimedia Commons", personName: m.personName, rule: m.rule || "wikidata", confidence: "high" });
        } catch { /* image unreachable now; other sources may still cover this person */ }
      }
      leaders = result.leaders || [];
    } catch (e) { state.sources.wikidata = { status: "error", message: String(e?.message || e).slice(0, 120) }; }
  }
  await publish(state);

  // Leadership without Form 4 filings (founders, chair, directors) for the People tab, with their
  // Commons portrait when they have one; the company's page and the proxy fill the gaps below.
  for (const leader of leaders) {
    let photo = null;
    if (leader.photo?.src) {
      try {
        const { saved } = await fromUrl(leader.photo.large || leader.photo.src);
        photo = { src: saved.url, source: "wikimedia", sourceUrl: leader.photo.source, credit: leader.photo.credit || "Wikimedia Commons" };
      } catch { /* the page or proxy may still have one */ }
    }
    state.leaders.push({ key: "wd:" + (leader.qid || leader.name), name: leader.name, qid: leader.qid || null, roles: leader.roles || [], current: leader.current !== false,
      wikidataUrl: leader.wikidataUrl || null, src: photo?.src || null, source: photo?.source || null, sourceUrl: photo?.sourceUrl || null, credit: photo?.credit || null,
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
  const need = [...pending().map(p => p.key), ...state.leaders.filter(l => !l.src).map(l => l.key)];
  const failed = e => ({ status: "error", message: String(e?.message || e).slice(0, 120), matches: [] });
  const personFor = m => people.find(p => (m.key && p.key === m.key) || (m.ownerCik && p.cik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, "")));
  const leaderFor = m => m.key?.startsWith("wd:") ? state.leaders.find(l => l.key === m.key) : null;
  const replaceable = current => !current || current.source === "sec-proxy";

  const applySite = async site => {
    state.sources.companySite = { status: site.status, matched: site.matches?.length || 0, pages: (site.pages || []).slice(0, 5), ...(site.message ? { message: site.message } : {}) };
    for (const m of site.matches || []) {
      const person = personFor(m), leader = person ? null : leaderFor(m);
      if (person ? !replaceable(state.photos[person.key]) : !leader || (leader.src && leader.source !== "sec-proxy")) continue;
      try {
        const { saved } = await fromUrl(m.imageUrl, { referer: m.pageUrl, userAgent: PUBLIC_UA });
        const photo = { src: saved.url, source: "company-site", sourceUrl: m.pageUrl, credit: "Company website" + (siteHost(m.pageUrl) ? " (" + siteHost(m.pageUrl) + ")" : ""), personName: m.cardName || m.personName, rule: m.rule, confidence: m.confidence || "high" };
        if (person) await assign(person, photo, { replace: true });
        else Object.assign(leader, { src: photo.src, source: photo.source, sourceUrl: photo.sourceUrl, credit: photo.credit });
      } catch { /* try the next source */ }
    }
    await publish(state);
  };
  const applyProxy = async proxy => {
    state.sources.secProxy = { status: proxy.status, matched: proxy.matches?.length || 0, accession: proxy.accession || null, ...(proxy.message ? { message: proxy.message } : {}) };
    const credit = "SEC proxy statement (DEF 14A" + (proxy.filedAt ? ", filed " + proxy.filedAt : "") + ")";
    for (const m of proxy.matches || []) {
      const person = personFor(m), leader = person ? null : leaderFor(m);
      if (person ? state.photos[person.key] : !leader || leader.src) continue;
      const src = await proxyPhoto(m).catch(() => null);
      if (!src) continue;
      if (person) await assign(person, { src, source: "sec-proxy", sourceUrl: proxy.documentUrl, credit, personName: m.personName || m.caption, rule: m.rule, confidence: m.confidence || "high" });
      else Object.assign(leader, { src, source: "sec-proxy", sourceUrl: proxy.documentUrl, credit });
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

  // A full-length or small Commons picture is still better than initials.
  for (const person of pending()) {
    if (!person.commonsFallback) continue;
    const { saved, m } = person.commonsFallback;
    await assign(person, { src: saved.url, source: "wikimedia", sourceUrl: m.photo.source || m.photo.src, credit: m.photo.credit || "Wikimedia Commons", personName: m.personName, rule: m.rule || "wikidata", confidence: "high" });
  }
  for (const person of people) delete person.commonsFallback;

  state.complete = true;
  state.coverage = { people: people.length, withPhoto: people.filter(p => state.photos[p.key]).length };
  await publish(state);
  return state;
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

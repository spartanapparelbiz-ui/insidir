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
import { putMedia, getRecord, putRecord } from "./media-store.mjs";
import { isEntityName, samePerson } from "./person-match.mjs";
import { resolveCompany } from "./intelligence.mjs";
import { getCompanyInsiders } from "./insiders.mjs";

const DAY = 86400000;
const COMPANY_TTL = 7 * DAY, PERSON_TTL = 90 * DAY;
const jobs = new Map();
// The browser computes the same key: owner CIK when the filing has one, else the normalized name.
const keyFor = person => person.cik ? "cik:" + String(person.cik).replace(/^0+/, "") : "name:" + String(person.name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
const optional = async path => { try { return await import(path); } catch (e) { if (!/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(e?.code || e?.message))) console.warn("Photo source unavailable:", path, e?.message); return null; } };

async function store(bytes, type) {
  const prepared = await preparePhoto(bytes, type, 256);
  return putMedia(prepared);
}
/* Commons portraits that are full-length or tiny are passed over for a better source. */
async function fromUrl(url) {
  const image = await fetchImage(url, { maxBytes: 4_000_000, userAgent: "InsidirResearch/1.0 (spartanapparelbiz@gmail.com)" });
  if (image.type === "svg" || image.type === "ico") throw new Error("Not a photo");
  return { saved: await store(image.bytes, image.type), size: imageSize(image.bytes, image.type) };
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
  const assign = async (person, photo) => {
    if (state.photos[person.key]) return;
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

  // 2 and 3 run together; the company's own page wins over the proxy when both match.
  const extraPeople = leaders.filter(l => l?.name).map(l => ({ name: l.name, key: "wd:" + (l.qid || l.name) }));
  const [sitesModule, proxyModule] = await Promise.all([optional("./leader-pages.mjs"), optional("./proxy-headshots.mjs")]);
  const remaining = pending().map(({ name, cik, role, key }) => ({ name, cik, role, key }));
  const [site, proxy] = await Promise.all([
    sitesModule?.leadershipPhotos && remaining.length ? sitesModule.leadershipPhotos({ cik: company.cik, name: company.name, ticker, insiders: remaining, extraPeople }).catch(e => ({ status: "error", message: e?.message, matches: [] })) : null,
    proxyModule?.proxyHeadshots && remaining.length ? proxyModule.proxyHeadshots({ cik: company.cik, insiders: remaining, extraPeople }).catch(e => ({ status: "error", message: e?.message, matches: [] })) : null
  ]);
  if (site) state.sources.companySite = { status: site.status, matched: site.matches?.length || 0, pages: (site.pages || []).slice(0, 5) };
  if (proxy) state.sources.secProxy = { status: proxy.status, matched: proxy.matches?.length || 0, accession: proxy.accession || null };
  const personFor = m => people.find(p => (m.key && p.key === m.key) || (m.ownerCik && p.cik && String(p.cik).replace(/^0+/, "") === String(m.ownerCik).replace(/^0+/, "")));
  for (const m of site?.matches || []) {
    const person = personFor(m);
    if (!person || state.photos[person.key]) continue;
    try {
      const { saved } = await fromUrl(m.imageUrl);
      await assign(person, { src: saved.url, source: "company-site", sourceUrl: m.pageUrl, credit: "Company website", personName: m.personName || m.cardName, rule: m.rule, confidence: m.confidence || "high" });
    } catch { /* try the next source */ }
  }
  for (const m of proxy?.matches || []) {
    const person = personFor(m);
    if (!person || state.photos[person.key]) continue;
    const src = m.photoUrl || (m.bytes ? (await store(m.bytes, m.type)).url : null);
    if (!src) continue;
    await assign(person, { src, source: "sec-proxy", sourceUrl: proxy.documentUrl, credit: "SEC proxy statement (DEF 14A" + (proxy.filedAt ? ", filed " + proxy.filedAt : "") + ")", personName: m.personName || m.caption, rule: m.rule, confidence: m.confidence || "high" });
  }
  // A full-length or small Commons picture is still better than initials.
  for (const person of pending()) {
    if (!person.commonsFallback) continue;
    const { saved, m } = person.commonsFallback;
    await assign(person, { src: saved.url, source: "wikimedia", sourceUrl: m.photo.source || m.photo.src, credit: m.photo.credit || "Wikimedia Commons", personName: m.personName, rule: m.rule || "wikidata", confidence: "high" });
  }
  for (const person of people) delete person.commonsFallback;

  // Leadership without Form 4 filings (e.g. founders, chair) shown in the People tab.
  const proxyByKey = new Map((proxy?.matches || []).filter(m => m.key?.startsWith("wd:")).map(m => [m.key, m]));
  for (const leader of leaders) {
    const key = "wd:" + (leader.qid || leader.name);
    let src = null, source = null, sourceUrl = null, credit = null;
    if (leader.photo?.src) {
      try { const { saved } = await fromUrl(leader.photo.large || leader.photo.src); src = saved.url; source = "wikimedia"; sourceUrl = leader.photo.source; credit = leader.photo.credit || "Wikimedia Commons"; } catch { /* fall through */ }
    }
    const fromProxy = proxyByKey.get(key);
    if (!src && fromProxy) { src = fromProxy.photoUrl || null; source = "sec-proxy"; sourceUrl = proxy.documentUrl; credit = "SEC proxy statement (DEF 14A)"; }
    state.leaders.push({ name: leader.name, qid: leader.qid || null, roles: leader.roles || [], current: leader.current !== false, wikidataUrl: leader.wikidataUrl || null, src, source, sourceUrl, credit,
      insider: people.some(p => samePerson(p.name, leader.name, leader.aliases || [])) });
  }

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

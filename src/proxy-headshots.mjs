/* Director and officer headshots printed in a company's SEC proxy statement (DEF 14A).
 *
 * The proxy is the one place where most mid/large companies publish a captioned portrait of
 * every director nominee. Images carry no reliable identity of their own, so a portrait is
 * attached to a person only through the document layout, with rules measured on 47 proxies:
 *   (a) alt text / original file name holds given name + surname, or surname + photo|nominee|...
 *   (b) a run of consecutive portraits takes the k-th distinct known name after the run
 *   (c) a single portrait takes the first known full name within 250 characters after it
 *   (d) "name before the image" only when the document's other portraits follow that layout
 *       and no different person-like caption follows the image (medium confidence)
 * Names are found by the strict shared matcher (samePerson), every caption must match exactly
 * one person, a file must get a majority of its votes for one person, and only paired images are
 * downloaded and checked (header size, aspect, bytes per pixel). No match beats a wrong match. */
import { secFetch, secFetchBytes, parseAtom } from "./sec.mjs";
import { sniffImage, imageSize } from "./media.mjs";
import { preparePhoto, rasterize } from "./image-analysis.mjs";
import { putMedia, getMedia, getRecord, putRecord } from "./media-store.mjs";
import { samePerson, secNameReadings, nameTokens, isEntityName, givenVariants } from "./person-match.mjs";
import { illustratedProxy } from "./photo-exclusions.mjs";

const DAY = 86400000;
const MAX_AGE_MS = 456 * DAY;            // about 15 months: older proxies picture a stale board
const RECORD_TTL = 400 * DAY;            // Archives files never change; key is the accession
const MAX_DOWNLOADS = 60;
const MAX_HTML_BYTES = 15_000_000;
const AFTER_WINDOW = 250, BEFORE_WINDOW = 250, CARD_WINDOW = 1800;
// Pairing rules version: a stored record from older rules is paired again (its downloaded files are reused).
const PAIRING_VERSION = 2;

/* ---------- HTML token stream ---------- */
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hyphen: "-", shy: "", bull: "•", middot: "·", eacute: "é", egrave: "è", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", zwj: "", zwnj: "", ensp: " ", emsp: " ", thinsp: " " };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
const BLOCK = new Set(["p", "div", "td", "tr", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "th", "ul", "ol", "section"]);
const attr = (attrs, name) => {
  const m = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : null;
};
function cssPx(style, prop, attrValue) {
  const m = new RegExp("(?:^|[;\\s])" + prop + "\\s*:\\s*([\\d.]+)\\s*(px|pt|in)?", "i").exec(style || "");
  if (m) { const v = Number(m[1]); const unit = (m[2] || "px").toLowerCase(); return v * (unit === "pt" ? 4 / 3 : unit === "in" ? 96 : 1); }
  if (attrValue && /^\d+(\.\d+)?$/.test(attrValue)) return Number(attrValue);
  return null;
}
/* Ordered text and img tokens; block elements become line breaks. */
export function tokenize(html) {
  const toks = [];
  let buf = "";
  const flush = () => { if (buf) { toks.push({ t: "text", s: decodeEntities(buf) }); buf = ""; } };
  const src = String(html).replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    buf += src.slice(last, m.index).replace(/\s+/g, " ");
    last = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (tag === "img" && !m[1]) {
      flush();
      const a = m[3], style = attr(a, "style") || "";
      toks.push({ t: "img", src: attr(a, "src") || "", alt: attr(a, "alt") || "", h: cssPx(style, "height", attr(a, "height")), w: cssPx(style, "width", attr(a, "width")) });
    } else if (BLOCK.has(tag)) buf += "\n";
  }
  buf += src.slice(last).replace(/\s+/g, " ");
  flush();
  return toks;
}

export function decodeHtml(bytes) {
  if (typeof bytes === "string") return bytes;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return Buffer.from(bytes).toString("latin1"); }
}

/* Lower-case, accents folded, curly quotes straightened, in-word hyphens/apostrophes removed. */
export function fold(x) {
  return String(x).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u00a0\u2000-\u200b\u202f]/g, " ")
    .replace(/([a-z])['\-\u2010\u2011\u2013](?=[a-z])/g, "$1");
}

/* ---------- people ---------- */
const cikKey = cik => String(cik ?? "").replace(/^0+/, "");
/* People to look for: insiders (SEC "LAST FIRST MIDDLE") plus extra natural-order names; an extra
 * that is the same person as an insider is merged into that insider. */
export function buildPeople(insiders = [], extraPeople = []) {
  const people = [];
  for (const p of insiders) {
    if (!p?.name || isEntityName(p.name) || !secNameReadings(p.name).length) continue;
    people.push({ id: people.length, keys: [p.key || (p.cik ? "cik:" + cikKey(p.cik) : "name:" + nameTokens(p.name).join(" "))], ownerCik: p.cik ? String(p.cik) : null, personName: p.name, secName: p.name, insider: p });
  }
  for (const x of extraPeople) {
    if (!x?.name || isEntityName(x.name)) continue;
    const t = nameTokens(x.name);
    if (t.length < 2) continue;
    const secName = [t.at(-1), ...t.slice(0, -1)].join(" ");
    const same = people.filter(p => samePerson(p.secName, x.name, x.aliases || []));
    if (same.length === 1) { same[0].keys.push(x.key || "name:" + t.join(" ")); continue; }
    if (same.length > 1) continue;  // cannot tell which insider this is
    people.push({ id: people.length, keys: [x.key || "name:" + t.join(" ")], ownerCik: null, personName: x.name, secName, aliases: x.aliases || [] });
  }
  for (const p of people) {
    p.surnames = [...new Set(secNameReadings(p.secName).map(r => r.surname.toLowerCase()).filter(s => s.length >= 2))];
    p.readings = secNameReadings(p.secName).filter(r => r.surname.length >= 2)
      .map(r => ({ surname: r.surname.toLowerCase(), firsts: [...new Set(givenVariants(r.given).map(g => g.toLowerCase()))] }));
  }
  return people;
}
const fingerprint = p => p.keys.join("|") + "=" + nameTokens(p.secName).join(" ");
const matchesCaption = (p, caption) => samePerson(p.secName, caption);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* Known people named in a text window: a surname preceded (within 4 words) by a given name that
 * the strict matcher accepts. Each hit lists every person its caption matches. */
export function findNames(text, people) {
  const low = fold(text), byPos = new Map();
  for (const p of people) {
    for (const s of p.surnames) {
      const re = new RegExp("\\b" + s.split("").map(escapeRe).join("\\s?") + "\\b", "g");
      let m;
      while ((m = re.exec(low))) {
        const pre = low.slice(Math.max(0, m.index - 40), m.index);
        const words = [...pre.matchAll(/[a-z]+/g)].slice(-4);
        for (let k = 1; k <= words.length; k++) {
          const first = words[words.length - k];
          const between = pre.slice(first.index);
          if (/[\n|;:]/.test(between)) break;           // the given name must sit on the same line
          let caption = between.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim() + " " + m[0];
          if (!matchesCaption(p, caption)) continue;
          // A two-word surname continues past the matched word ("suzanne nora" + "johnson").
          const next = /^\s+([a-z]+)/.exec(low.slice(m.index + m[0].length, m.index + m[0].length + 30))?.[1];
          if (next && nameTokens(p.secName).includes(next.toUpperCase()) && !caption.split(" ").includes(next)) caption += " " + next;
          const pos = m.index - (pre.length - first.index);
          const hit = byPos.get(m.index) || { pos, end: m.index + m[0].length, caption, people: new Set() };
          hit.people.add(p.id);
          hit.pos = Math.min(hit.pos, pos);
          byPos.set(m.index, hit);
          break;
        }
      }
    }
  }
  return [...byPos.values()].sort((a, b) => a.pos - b.pos);
}

/* Rule (a): alt text or original file name names exactly one person. */
const ALT_KEYWORD = /photo|ph_|headshot|nominee|director|portrait|bio|pic/;
export function altName(alt, src, people) {
  const s = fold(String(alt || "") + " " + String(src || "").replace(/\.[a-z0-9]+$/i, ""));
  const s2 = s.replace(/[^a-z]/g, "");
  const words = " " + s.replace(/\.(jpe?g|png|gif)\b/g, " ").replace(/[^a-z]+/g, " ") + " ";
  const kw = ALT_KEYWORD.test(s);
  const found = [];
  for (const p of people) {
    for (const r of p.readings) {
      const L = r.surname.replace(/\s/g, "");
      if (L.length < (kw ? 4 : 3)) continue;
      let i = s2.indexOf(L);
      while (i >= 0) {
        const outside = f => { let j = s2.indexOf(f); while (j >= 0) { if (j + f.length <= i || j >= i + L.length) return true; j = s2.indexOf(f, j + 1); } return false; };
        const full = r.firsts.some(f => f.length >= 3 && outside(f));
        const before = s2.slice(Math.max(0, i - 14), i), after = s2.slice(i + L.length, i + L.length + (kw ? 3 : 14));
        const adjacent = r.firsts.some(f => f.length >= 3 && (before.includes(f) || after.includes(f)));
        // Without a photo keyword the given name must sit right next to the surname.
        const initialAfter = words.includes(L + r.firsts[0][0] + " ");   // "Nominees_CarneyL.jpg"
        const ok = kw ? adjacent || initialAfter || /nominee/.test(s) : adjacent;
        if (ok) found.push({ p, start: i, end: i + L.length, full });
        i = s2.indexOf(L, i + 1);
      }
    }
  }
  // Novak inside Novakovic, Ryan inside Maryann: a match inside a longer one is not a match.
  const kept = found.filter(f => !found.some(g => g !== f && g.start <= f.start && g.end >= f.end && g.end - g.start > f.end - f.start));
  const ids = new Set(kept.map(f => f.p.id));
  if (ids.size !== 1) return null;
  const hit = kept[0];
  return { person: hit.p, caption: (alt || src || "").slice(0, 120), full: kept.some(f => f.full) };
}

/* A line that reads like a person's name caption (for detecting someone not in our list). */
const GENNAME = /^(?:(?:Dr|Mr|Ms|Mrs)\.?\s)?[A-Z][a-zA-Z'\u2019\-.]+(?:\s+(?:[A-Z][a-zA-Z'\u2019\-.]*|de|van|von|del|da|la)){1,4},?$/;
const ORG_WORD = /\b(inc|corp|corporation|llc|ltd|plc|group|holdings|university|college|institute|bank|fund|partners|capital|technologies|systems|foundation|association|council|trust|school)\b\.?/i;
const NOT_NAME = /director|committee|board|officer|independent|chair|president|company|proxy|annual|meeting|qualification|experience|skills|contents|nominee|vote|proposal|statement|corporate|governance|executive|compensation|shareholder|stockholder|summary|overview|highlights/i;
/* Title-case headings that are not names ("Risk Management", "What We Do", "Grameen America"). */
const COMMON = new Set(("a an the of and or for to in on at by with from as we our us you your who what how why when where which is are be do don't does our its it this that these those " +
  "information management risk matters matter policy policies expert expertise category development industry industries global america american americas national international " +
  "plan plans share shares retention cumulative former current other key total financial finance audit technology technologies leadership strategy strategic operations operating " +
  "business public private sector service services public relations human capital resources marketing sales consumer brand brands digital data security cyber cybersecurity " +
  "engage engagement involved overview report review results performance pay program programs benefits award awards equity cash bonus incentive long short term annual " +
  "material additional definitive materials notice letter message year years fiscal quarter today future new our people culture values community communities environmental " +
  "social sustainability climate health safety quality product products research science innovation international experience skills background education career " +
  "manufacturing retail energy healthcare banking insurance investment investments government regulatory legal compliance accounting tax treasury real estate media " +
  "transportation logistics supply chain customer customers employee employees talent diversity inclusion member members chief vice senior lead principal general counsel " +
  "secretary treasurer founder cofounder co-founder partner managing ceo cfo coo cto cio svp evp gc since age tenure term terms none yes no not all").split(" "));
export function isPersonLine(raw) {
  const line = String(raw).replace(/\s+/g, " ").trim();
  if (!line) return false;
  const head = line.split(/,|\bAge\b/)[0].trim();
  if (!(head.length > 4 && head.length <= 40 && GENNAME.test(head) && !NOT_NAME.test(head) && !ORG_WORD.test(head))) return false;
  return !head.toLowerCase().split(/\s+/).some(w => COMMON.has(w.replace(/[^a-z'-]/g, "")));
}
export function personLikeLine(text) {
  for (const raw of String(text).replace(/\|/g, "\n").split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || /^[\d\W]+$/.test(line) || /^table of contents$/i.test(line)) continue;
    return isPersonLine(line);
  }
  return false;
}
/* Names in reading order, line by line: known people (by matcher) and person-like captions of
 * people we do not know. An unknown caption between a portrait and the known name it would be
 * paired with means the layout cannot be trusted there. */
export function captionSlots(text, people) {
  const slots = [];
  const lines = String(text).replace(/\|/g, "\n").split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let hits = findNames(line, people);
    if (!hits.length && isPersonLine(line) && i + 1 < lines.length) {
      // "CHRISTOPHER C." / "DAVIS": a caption broken over two lines.
      const joined = findNames(line + " " + lines[i + 1], people).filter(h => h.pos < line.length && h.end > line.length);
      if (joined.length) { hits = joined; offset += line.length + 1; i++; }
    }
    if (hits.length) for (const h of hits) slots.push({ known: true, pos: offset + Math.min(h.pos, line.length), hit: h, key: [...h.people].sort().join(",") });
    else if (isPersonLine(line)) slots.push({ known: false, pos: offset + line.search(/\S/), line: line.trim().slice(0, 60) });
    offset += lines[i].length + 1;
  }
  return slots;
}

/* ---------- pairing ---------- */
const BAD_ALT = /(^|[^a-z])(logos?|icons?|sprites?|charts?|signat\w*|cards?|covers?|banners?|checks?|checkmarks?|arrows?|bullets?|qr)(?![a-z])/i;
function candidateImage(tok, files) {
  const name = basename(tok.src);
  if (!name || !files.has(name.toLowerCase())) return false;
  if (tok.h != null && tok.h < 36) return false;
  if (tok.h != null && tok.h > 600) return false;               // full pages, covers
  if (tok.h && tok.w && (tok.w / tok.h < 0.6 || tok.w / tok.h > 1.7)) return false;
  if (/\.(jpe?g|png|gif)/i.test(tok.alt) && BAD_ALT.test(tok.alt.replace(/\.(jpe?g|png|gif)/ig, " "))) return false;
  return true;
}
function basename(src) {
  const s = String(src || "").trim();
  if (!s || /^(data|javascript):/i.test(s)) return null;
  if (/^https?:/i.test(s) && !/^https:\/\/www\.sec\.gov\/Archives\//i.test(s)) return null;
  return s.split(/[?#]/)[0].split("/").pop();
}

/* Pair portrait placements with people. Returns placements [{file, personId, rule, caption,
 * confidence, run}] (personId null when unpaired) and the runs. */
export function pairPortraits(tokens, people, files) {
  const isCand = tokens.map(tk => tk.t === "img" && candidateImage(tk, files));
  const idx = tokens.map((_, i) => i).filter(i => isCand[i]);
  const runs = [];
  let cur = [];
  for (const i of idx) {
    if (cur.length && tokens.slice(cur.at(-1) + 1, i).every(tk => (tk.t === "text" && !tk.s.trim()) || tk.t === "img")) cur.push(i);
    else { if (cur.length) runs.push(cur); cur = [i]; }
  }
  if (cur.length) runs.push(cur);

  const ctx = runs.map(run => {
    let after = "", k = run.at(-1) + 1;
    const nearAlt = [];
    while (k < tokens.length && !isCand[k] && after.length < 400 * run.length) {
      if (tokens[k].t === "text") after += tokens[k].s;
      else if (!after.trim()) nearAlt.push(tokens[k]);
      k++;
    }
    // Profile cards (Donnelley's layout): portrait, then committees / tenure / age / expertise, then the
    // name, ~900 characters on. The card's text runs to the next portrait.
    let card = "";
    for (let j = run.at(-1) + 1; j < tokens.length && !isCand[j] && card.length < CARD_WINDOW; j++) if (tokens[j].t === "text") card += tokens[j].s;
    let before = "";
    k = run[0] - 1;
    while (k >= 0 && !isCand[k] && before.length < 400) { if (tokens[k].t === "text") before = tokens[k].s + before; k--; }
    // Distinct known names after the run, stopping at an unknown person's caption.
    const distinct = [], seen = new Set();
    let blocked = null;
    for (const slot of captionSlots(after.slice(0, 300 * run.length), people)) {
      if (!slot.known) { blocked = slot.line; break; }
      if (!seen.has(slot.key)) { seen.add(slot.key); distinct.push({ ...slot.hit, pos: slot.pos }); }
      if (distinct.length >= run.length) break;
    }
    const b = before.slice(-BEFORE_WINDOW);
    const beforeHits = findNames(b, people).map(h => ({ ...h, dist: b.length - h.end }));
    return { run, after, card, distinct, blocked, beforeHits, nearAlt, beforeFolded: fold(b) };
  });

  // Layout vote for rule (d): how many single portraits have their only nearby name before them.
  let beforeLayout = 0, afterLayout = 0;
  for (const c of ctx) {
    if (c.run.length !== 1) continue;
    const da = c.distinct[0] ? c.distinct[0].pos : c.blocked ? 0 : Infinity;
    const lb = c.beforeHits.at(-1);
    if (da <= AFTER_WINDOW) afterLayout++;
    else if (lb) beforeLayout++;
  }
  const allowBefore = beforeLayout >= 2 && beforeLayout > afterLayout;

  const placements = [];
  const single = h => h.people.size === 1 ? [...h.people][0] : null;
  ctx.forEach((c, runNo) => {
    c.run.forEach((i, r) => {
      const tok = tokens[i];
      let personId = null, rule = null, caption = null, confidence = null;
      const a = altName(tok.alt, basename(tok.src), people);
      if (a) { personId = a.person.id; rule = "alt"; caption = a.caption; confidence = a.full ? "high" : "medium"; }
      else if (c.run.length > 1 && c.distinct.length >= c.run.length) {
        const h = c.distinct[r];
        personId = single(h); rule = "run"; caption = h.caption; confidence = "high";
      } else if (c.run.length === 1) {
        const h = c.distinct[0];
        const lb = c.beforeHits.at(-1);
        // A portrait followed by "Age 60 / Director since" belongs to the name printed before it;
        // a name further on is someone else (or this person's bio mentioning a colleague).
        const profile = PROFILE_AFTER.test(c.after.slice(0, 80).replace(/\s+/g, " "));
        if (profile) {
          if (lb && profileBefore(c, lb)) { personId = single(lb); rule = "before-profile"; caption = lb.caption; confidence = "high"; }
          else if (allowBefore && !c.blocked && lb) { personId = single(lb); rule = "before"; caption = lb.caption; confidence = "medium"; }
          else rule = "profile-unknown";
        }
        else if (h && h.pos <= AFTER_WINDOW) { personId = single(h); rule = "after"; caption = h.caption; confidence = "high"; }
        else if (CARD_AFTER.test(c.after.slice(0, 80).replace(/\s+/g, " ")) && !(lb && lb.dist <= 90)) {
          const first = captionSlots(c.card, people)[0];
          if (first?.known && single(first.hit) != null) { personId = single(first.hit); rule = "card"; caption = first.hit.caption; confidence = "high"; }
          else rule = "card-unknown";
        }
        else if (allowBefore && !c.blocked && c.beforeHits.length && !personLikeLine(c.after.slice(0, 120))) {
          const hb = c.beforeHits.at(-1);
          personId = single(hb); rule = "before"; caption = hb.caption; confidence = "medium";
        }
      }
      if (personId == null && rule == null && c.run.length === 1) {
        for (const tk of c.nearAlt) {
          const x = altName("photo " + tk.alt, "", people);
          if (x) { personId = x.person.id; rule = "alt-adjacent"; caption = x.caption; confidence = "medium"; break; }
        }
      }
      placements.push({ file: basename(tok.src), personId, rule, caption, confidence, run: runNo, runLength: c.run.length, h: tok.h, w: tok.w, blockedBy: c.blocked });
    });
  });
  return { placements, runs };
}

/* Profile layout: "Alice L. Jolla INDEPENDENT [portrait] Age 60 Director since 2023", or "Susan Li -
 * Chief Financial Officer [portrait] Age 40". The full name is followed only by role and title
 * words (so another person's name can never be skipped over) and the text after the portrait
 * opens with the age or tenure line, so the portrait belongs to that name whatever the rest of
 * the document does. */
const TITLE_WORDS = new Set(("independent lead non executive nonexecutive chair chairman chairwoman chairperson vice director directors nominee " +
  "president ceo cfo coo cto cio clo cao cmo cpo evp svp vp chief officer financial operating technology technical legal accounting marketing " +
  "people human resources information product products commercial strategy strategic business global group corporate general counsel " +
  "secretary treasurer controller founder cofounder co senior managing partner of the board and & emeritus former interim acting principal " +
  "administrative communications affairs public policy government risk compliance digital data security transformation operations sales " +
  "growth revenue investment investor relations audit development research science scientific medical innovation engineering").split(" "));
/* A card that opens with its fields and prints the name last: "[portrait] Board Committees: Audit · Director
 * since: July 2015 · Age: 49 · Experience ... Jonathan Christodoro". Only the first name-like line of the card
 * counts, and only when it is a known person and no name sits right before the portrait. */
const CARD_AFTER = /^[\s|•·]*(?:board\s+committees?\b|committees?\s*:|committee\s+memberships?\b)/i;
const PROFILE_AFTER = /^[\s|•·]*(?:age[:\s]+\d{2}\b|director\s+since\b|\d{2}\s*years?\s+old\b)/i;
function profileBefore(c, hit) {
  if (hit.dist > 90) return false;
  // Hit positions index the folded text.
  const words = c.beforeFolded.slice(hit.end).replace(/[^a-z&]+/g, " ").trim().split(" ").filter(Boolean);
  return words.length <= 10 && words.every(w => TITLE_WORDS.has(w));
}

/* Per-file majority vote and per-person ranked candidate files. */
const RULE_RANK = { alt: 0, after: 1, "before-profile": 1, run: 2, card: 2, "alt-adjacent": 3, before: 4 };
export function selectFiles(placements, sizes = new Map()) {
  const fileVotes = new Map(), bestRule = new Map();
  for (const p of placements) {
    if (p.personId == null) continue;
    const v = fileVotes.get(p.file) || new Map();
    v.set(p.personId, (v.get(p.personId) || 0) + 1);
    fileVotes.set(p.file, v);
    const rk = p.file + "\u0000" + p.personId;
    bestRule.set(rk, Math.min(bestRule.get(rk) ?? 9, RULE_RANK[p.rule] ?? 9));
  }
  const byPerson = new Map();
  for (const [file, votes] of fileVotes) {
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    for (const [pid, n] of votes) {
      if (n * 2 <= total) continue;                      // icons reused across names drop out here
      const list = byPerson.get(pid) || [];
      list.push({ file, votes: n, rank: bestRule.get(file + "\u0000" + pid) });
      byPerson.set(pid, list);
    }
  }
  for (const list of byPerson.values()) list.sort((a, b) => b.votes - a.votes || a.rank - b.rank || (sizes.get(b.file.toLowerCase()) || 0) - (sizes.get(a.file.toLowerCase()) || 0));
  return byPerson;
}

/* Header checks on a downloaded file: type, size, aspect and bytes per pixel. */
export function checkImage(bytes) {
  const type = sniffImage(bytes);
  if (!["jpeg", "png", "gif"].includes(type)) return { ok: false, reason: "type" };
  const size = imageSize(bytes, type);
  if (!size?.width || !size?.height) return { ok: false, reason: "size", type };
  const { width, height } = size, aspect = width / height;
  if (Math.min(width, height) < 60) return { ok: false, reason: "small", type, width, height };
  if (Math.max(width, height) > 3000) return { ok: false, reason: "large", type, width, height };
  if (aspect < 0.7 || aspect > 1.45) return { ok: false, reason: "aspect", type, width, height };
  if (bytes.length / (width * height) < 0.12) return { ok: false, reason: "flat", type, width, height };
  return { ok: true, type, width, height };
}
/* Continuous tone in the centre of the picture. Measured on 276 proxy images: every one of 118
 * real portraits had its 4 most common colours (5 bits per channel) covering at most 56% of the
 * centre and at least 40 of 64 luminance levels; the icons, check marks and logos that passed
 * the header checks covered 79-89% with 27-56 levels. */
export function toneOf(px, w, h) {
  const x0 = Math.round(w * .2), y0 = Math.round(h * .15), cw = Math.max(1, w - 2 * x0), ch = Math.max(1, h - 2 * y0);
  const bins = new Map(), levels = new Set(), N = 64;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = ((y0 + Math.floor((y + .5) * ch / N)) * w + x0 + Math.floor((x + .5) * cw / N)) * 4;
    const a = px[i + 3] / 255, r = px[i] * a + 255 * (1 - a), g = px[i + 1] * a + 255 * (1 - a), b = px[i + 2] * a + 255 * (1 - a);
    const k = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
    bins.set(k, (bins.get(k) || 0) + 1);
    levels.add(Math.round((r * .3 + g * .59 + b * .11) / 4));
  }
  const top4 = [...bins.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) / (N * N);
  return { top4, levels: levels.size, portraitLike: top4 <= .62 && levels.size >= 36 };
}
export async function checkPortrait(bytes) {
  const head = checkImage(bytes);
  if (!head.ok) return head;
  try {
    const raster = await rasterize(bytes, head.type, 160);
    const tone = toneOf(raster.data, raster.width, raster.height);
    return tone.portraitLike ? { ...head, top4: +tone.top4.toFixed(3), levels: tone.levels } : { ...head, ok: false, reason: "flat-tone", top4: +tone.top4.toFixed(3), levels: tone.levels };
  } catch { return { ...head, ok: false, reason: "decode" }; }
}

/* ---------- the source ---------- */
export function latestProxy(submissions, now = Date.now()) {
  const r = submissions?.filings?.recent;
  if (!r?.form) return null;
  let best = null;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== "DEF 14A") continue;
    const filedAt = r.filingDate?.[i];
    if (!best || String(filedAt) > String(best.filedAt)) best = { accession: r.accessionNumber[i], filedAt, primaryDocument: r.primaryDocument?.[i] || "" };
  }
  if (!best) return null;
  best.stale = !(Date.parse(best.filedAt) > now - MAX_AGE_MS);
  return best;
}

/* EDGAR's company browse feed, filtered to DEF 14A: used when the submissions file is too large
 * to fetch (JPM) or its "recent" window no longer reaches the proxy (very active filers). */
export function latestProxyFromAtom(xml, now = Date.now()) {
  const entry = parseAtom(xml, { forms: ["DEF 14A"] }).filter(e => /^DEF 14A\b(?!\/)/.test(e.title || "") && /^\d{18}$/.test(e.accession))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (!entry) return null;
  const filedAt = String(entry.publishedAt || "").slice(0, 10);
  return { accession: entry.accession.replace(/^(\d{10})(\d{2})(\d{6})$/, "$1-$2-$3"), filedAt, primaryDocument: "", stale: !(Date.parse(filedAt) > now - MAX_AGE_MS) };
}

const toMatch = (p, key, m, accession) => ({
  ownerCik: p.ownerCik, key, personName: p.personName,
  caption: m.caption, imageUrl: m.imageUrl, file: m.file, type: m.type, width: m.width, height: m.height,
  sha: m.sha, photoUrl: m.photoUrl, originalSha: m.originalSha, rule: m.rule, confidence: m.confidence, accession
});

/* proxyHeadshots({cik, insiders:[{name,cik,role,key?}], extraPeople?:[{name,key,aliases?}], submissions?})
 *   -> {status:'ok'|'none'|'no-proxy'|'error', accession, filedAt, documentUrl, matches:[...]} */
export async function proxyHeadshots({ cik, insiders = [], extraPeople = [], submissions = null } = {}, { fetcher = secFetch, fetchBytes = secFetchBytes, now = Date.now(), useCache = true } = {}) {
  const cikInt = cikKey(cik);
  if (!/^\d{1,10}$/.test(cikInt)) return { status: "error", message: "Invalid CIK", matches: [] };
  let accession = null, filedAt = null, documentUrl = null;
  try {
    let proxy = null;
    try {
      const subs = submissions || await fetcher("https://data.sec.gov/submissions/CIK" + cikInt.padStart(10, "0") + ".json", { json: true });
      proxy = latestProxy(subs, now);
    } catch { /* fall back to the browse feed below */ }
    if (!proxy || proxy.stale) {
      const atom = latestProxyFromAtom(await fetcher("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cikInt.padStart(10, "0") + "&type=DEF+14A&dateb=&owner=include&count=10&output=atom"), now);
      if (atom && (!proxy || atom.filedAt > proxy.filedAt)) proxy = atom;
    }
    if (!proxy) return { status: "no-proxy", reason: "none filed", matches: [] };
    ({ accession, filedAt } = proxy);
    if (illustratedProxy(cikInt)) return { status: "none", reason: illustratedProxy(cikInt), accession, filedAt, matches: [] };
    if (proxy.stale) return { status: "no-proxy", reason: "older than 15 months", accession, filedAt, matches: [] };
    const base = "https://www.sec.gov/Archives/edgar/data/" + cikInt + "/" + accession.replace(/-/g, "") + "/";
    const people = buildPeople(insiders, extraPeople);
    const wanted = people.map(fingerprint);

    const cached = useCache ? await getRecord("proxy-headshots", accession) : null;
    if (cached && cached.v === PAIRING_VERSION && wanted.every(f => cached.evaluated?.includes(f))) {
      documentUrl = cached.documentUrl;
      return await fromRecord(cached, people, fetchBytes);
    }

    const index = await fetcher(base + "index.json", { json: true });
    const items = Array.isArray(index?.directory?.item) ? index.directory.item : [];
    let primary = proxy.primaryDocument;
    if (!/\.html?$/i.test(primary || "")) primary = items.filter(x => /\.html?$/i.test(x.name) && !/-index(-headers)?\.html?$/i.test(x.name))
      .sort((a, b) => /def14a/i.test(b.name) - /def14a/i.test(a.name) || Number(b.size || 0) - Number(a.size || 0))[0]?.name;
    if (!primary) return { status: "none", reason: "no HTML document", accession, filedAt, matches: [] };
    documentUrl = base + primary;
    const files = new Set(), sizes = new Map();
    for (const x of items) if (/\.(jpe?g|png|gif)$/i.test(x?.name || "")) { files.add(x.name.toLowerCase()); sizes.set(x.name.toLowerCase(), Number(x.size) || 0); }

    // Pairing uses everyone we know of; a previous run's people stay in the dictionary.
    const known = [...people];
    for (const f of cached?.people || []) if (!people.some(p => fingerprint(p) === fingerprint(f))) known.push({ ...f, id: known.length });
    known.forEach((p, i) => { p.id = i; });

    const record = { v: PAIRING_VERSION, accession, filedAt, documentUrl, evaluated: known.map(fingerprint), people: known.map(({ insider, ...p }) => p), files: { ...(cached?.files || {}) }, matches: [] };
    // Through the binary path: large proxies (KO, CBRE) exceed the 5MB text limit of secFetch.
    const html = decodeHtml(await fetchBytes(documentUrl, { maxBytes: MAX_HTML_BYTES }));
    const tokens = tokenize(html);
    // Who the proxy names at all (full name): a Wikidata "board member" it never mentions has left.
    const named = new Set(findNames(tokens.filter(t => t.t === "text").map(t => t.s).join("\n"), known).flatMap(h => [...h.people]));
    record.mentioned = known.filter(p => named.has(p.id)).map(fingerprint);
    if (!files.size) { await save(record, useCache); return finish(record, people, "none"); }
    const { placements } = pairPortraits(tokens, known, files);

    // Download only paired files, then drop placements on files that fail the header checks and
    // every run-order pairing of a run that contained a failing file (it may have shifted names).
    const byPerson0 = selectFiles(placements, sizes);
    const needed = new Set();
    for (const list of byPerson0.values()) for (const c of list.slice(0, 3)) needed.add(c.file);
    for (const p of placements) if (p.rule === "run" && p.personId != null) needed.add(p.file);
    const original = new Map();
    for (const file of [...needed].slice(0, MAX_DOWNLOADS)) {
      const key = file.toLowerCase();
      let info = record.files[key];
      let bytes = info?.originalSha ? (await getMedia(info.originalSha))?.bytes : null;
      if (!info || (info.ok && !bytes)) {
        try { bytes = await fetchBytes(base + file, { maxBytes: 4_000_000 }); }
        catch (e) { if (!info) continue; bytes = null; }
        if (bytes) {
          const check = await checkPortrait(bytes);
          info = { ...check };
          if (check.ok) info.originalSha = (await putMedia({ bytes, type: check.type, width: check.width, height: check.height })).sha;
          record.files[key] = info;
        }
      }
      if (bytes && info?.ok) original.set(key, Buffer.from(bytes));
    }
    const valid = file => record.files[file.toLowerCase()]?.ok === true;
    const badRuns = new Set(placements.filter(p => p.rule === "run" && !valid(p.file)).map(p => p.run));
    const kept = placements.map(p => (p.personId == null || !valid(p.file) || (p.rule === "run" && badRuns.has(p.run))) ? { ...p, personId: null } : p);
    const byPerson = selectFiles(kept, sizes);

    const chosen = [];
    for (const [pid, list] of byPerson) {
      const top = list[0];
      const best = kept.filter(p => p.personId === pid && p.file === top.file)
        .sort((a, b) => (a.confidence === "high" ? 0 : 1) - (b.confidence === "high" ? 0 : 1))[0];
      chosen.push({ pid, file: top.file, rule: best.rule, caption: best.caption, confidence: best.confidence, order: kept.indexOf(best) });
    }
    // The same picture must never be two people.
    const shaCount = new Map();
    for (const c of chosen) { const s = record.files[c.file.toLowerCase()]?.originalSha; shaCount.set(s, (shaCount.get(s) || 0) + 1); }
    for (const c of chosen.sort((a, b) => a.order - b.order)) {
      const info = record.files[c.file.toLowerCase()];
      if (!info?.originalSha || shaCount.get(info.originalSha) > 1) continue;
      const bytes = original.get(c.file.toLowerCase());
      if (!info.photoSha) {
        if (!bytes) continue;
        const prepared = await preparePhoto(bytes, info.type, 256);
        const saved = await putMedia(prepared);
        info.photoSha = saved.sha; info.photoUrl = saved.url;
      }
      record.matches.push({ personFingerprint: fingerprint(known[c.pid]), file: c.file, imageUrl: base + c.file, type: info.type, width: info.width, height: info.height,
        originalSha: info.originalSha, sha: info.photoSha, photoUrl: info.photoUrl, rule: c.rule, caption: c.caption, confidence: c.confidence });
    }
    await save(record, useCache);
    return await finish(record, people, record.matches.length ? "ok" : "none", original);
  } catch (e) {
    return { status: "error", message: String(e?.message || e).slice(0, 200), accession, filedAt, documentUrl, matches: [] };
  }
}
async function save(record, useCache) { if (useCache) await putRecord("proxy-headshots", record.accession, record, RECORD_TTL); }
async function fromRecord(record, people, fetchBytes) {
  const original = new Map();
  for (const m of record.matches) {
    let bytes = (await getMedia(m.originalSha))?.bytes;
    if (!bytes) { try { bytes = await fetchBytes(m.imageUrl); } catch { bytes = null; } }
    if (bytes) original.set(m.file.toLowerCase(), Buffer.from(bytes));
  }
  return finish(record, people, record.matches.length ? "ok" : "none", original);
}
function finish(record, people, status, original = new Map()) {
  const matches = [];
  for (const m of record.matches) {
    const p = people.find(x => fingerprint(x) === m.personFingerprint);
    if (!p) continue;
    for (const key of p.keys) matches.push({ ...toMatch(p, key, m, record.accession), bytes: original.get(m.file.toLowerCase()) || null });
  }
  const mentioned = Array.isArray(record.mentioned) ? people.filter(p => record.mentioned.includes(fingerprint(p))).flatMap(p => p.keys) : undefined;
  return { status: matches.length ? "ok" : status === "ok" ? "none" : status, accession: record.accession, filedAt: record.filedAt, documentUrl: record.documentUrl, matches, mentioned,
    considered: mentioned ? people.flatMap(p => p.keys) : undefined };
}

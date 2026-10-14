/* One strict matcher for every photo source. A photo is attached to an SEC reporting owner only
 * when the names agree on surname AND given name (exact, nickname, or a 3+ letter prefix) and no
 * middle initial conflicts. Callers must additionally prove a tie to the company; a name alone
 * is never enough (name-only matching produced wrong people in the source research). */

const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V", "MR", "MRS", "MS", "DR", "PHD", "MD", "CPA", "ESQ", "MBA", "CFA", "JD", "HON"]);
const NICKNAMES = [
  ["TIMOTHY", "TIM"], ["MICHAEL", "MIKE"], ["WILLIAM", "BILL", "WILL", "BILLY"], ["ROBERT", "BOB", "ROB", "BOBBY"], ["JAMES", "JIM", "JAMIE", "JIMMY"],
  ["THOMAS", "TOM"], ["CHRISTOPHER", "CHRIS"], ["CHRISTINE", "CHRIS"], ["JOSEPH", "JOE"], ["STEVEN", "STEVE"], ["STEPHEN", "STEVE"], ["ANDREW", "ANDY", "DREW"],
  ["VIRGINIA", "GINNI"], ["BENJAMIN", "BEN"], ["BENITO", "BEN"], ["ARTHUR", "ART"], ["HERBERT", "HERB"], ["RONALD", "RON"], ["SUSAN", "SUE"], ["SUZANNE", "SUE"],
  ["RAYMOND", "RAY"], ["DOUGLAS", "DOUG"], ["MATTHEW", "MATT"], ["JEFFREY", "JEFF"], ["JEFFERY", "JEFF"], ["KATHERINE", "KATE", "KATHY", "KATIE"], ["KATHLEEN", "KATHY", "KATE"],
  ["ANTHONY", "TONY"], ["ANTONIO", "TONY"], ["NICHOLAS", "NICK"], ["JENHSUN", "JENSEN"], ["DANIEL", "DAN", "DANNY"], ["DAVID", "DAVE"], ["EDWARD", "ED", "TED", "EDDIE"],
  ["RICHARD", "RICK", "DICK", "RICH"], ["CHARLES", "CHUCK", "CHARLIE"], ["GREGORY", "GREG"], ["SAMUEL", "SAM"], ["SAMANTHA", "SAM"], ["ALEXANDER", "ALEX"], ["ALEXANDRA", "ALEX"],
  ["JONATHAN", "JON"], ["JOHN", "JACK"], ["PATRICK", "PAT"], ["PATRICIA", "PAT", "TRISH"], ["ELIZABETH", "LIZ", "BETH", "BETSY"], ["MARGARET", "PEGGY", "MEG"], ["JENNIFER", "JEN", "JENNY"],
  ["KENNETH", "KEN"], ["LAWRENCE", "LARRY"], ["PETER", "PETE"], ["PHILIP", "PHIL"], ["PHILLIP", "PHIL"], ["FREDERICK", "FRED"], ["GERALD", "JERRY"], ["GERARD", "GERRY"],
  ["DONALD", "DON"], ["RANDALL", "RANDY"], ["TERRENCE", "TERRY"], ["TERRANCE", "TERRY"], ["ZACHARY", "ZACH"], ["NATHANIEL", "NATE"], ["NATHAN", "NATE"], ["VINCENT", "VINCE"],
  ["ALBERT", "AL"], ["ALAN", "AL"], ["ALLEN", "AL"], ["DEBORAH", "DEBBIE", "DEB"], ["DEBRA", "DEB"], ["REBECCA", "BECKY"], ["JOSHUA", "JOSH"], ["MITCHELL", "MITCH"]
];
const NICK = new Map();
for (const group of NICKNAMES) for (const a of group) for (const b of group) if (a !== b) { if (!NICK.has(a)) NICK.set(a, new Set()); NICK.get(a).add(b); }

export const ENTITY_PATTERN = /\b(LLC|L\.?L\.?C|L\.?P\.?|LTD|INC|CORP|CORPORATION|TRUST|FUND|FUNDS|PARTNERS|CAPITAL|MANAGEMENT|HOLDINGS?|GROUP|ADVISORS|ADVISERS|FOUNDATION|BANK|PLC|N\.?V|S\.?A|AG|GMBH|LIMITED|VENTURES|INVESTMENTS?|ASSOCIATES|COMPANY|CO)\b/i;
export const isEntityName = name => ENTITY_PATTERN.test(String(name || ""));

/* Upper-case tokens: accents folded, curly apostrophes straightened, in-word hyphens and
 * apostrophes removed (O'Brien -> OBRIEN), honorifics and suffixes dropped. */
export function nameTokens(raw) {
  return String(raw || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'")
    .replace(/\(.*?\)/g, " ").replace(/"[^"]*"/g, " ").toUpperCase()
    .replace(/(\w)['-](?=\w)/g, "$1").replace(/[^A-Z\s]/g, " ").split(/\s+/)
    .filter(t => t && !SUFFIXES.has(t));
}

/* Candidate (given, surname, middles) readings of an SEC "LAST FIRST MIDDLE" name; some filers
 * store "FIRST LAST" and some surnames have two words (NORA JOHNSON SUZANNE). */
export function secNameReadings(raw) {
  const t = nameTokens(raw);
  if (t.length < 2) return [];
  const out = [];
  const add = (surname, rest) => {
    const g = rest.find(x => x.length > 1);
    if (!g || !surname) return;
    out.push({ surname, given: g, middles: rest.filter(x => x !== g) });
  };
  add(t[0], t.slice(1));                                   // LAST FIRST MIDDLE
  if (t.length >= 3) add(t[0] + t[1], t.slice(2));         // TWO-WORD LAST, FIRST
  add(t.at(-1), t.slice(0, -1));                           // FIRST MIDDLE LAST
  return out;
}
/* Readings of a natural-order name ("Jensen Huang", "Suzanne Nora Johnson"). */
export function naturalNameReadings(raw) {
  const t = nameTokens(raw);
  if (t.length < 2) return [];
  // The given name is the first full word; a leading initial ("W. Patrick Mattson") is a middle.
  const reading = (surname, rest) => {
    const i = Math.max(0, rest.findIndex(x => x.length > 1));
    return { surname, given: rest[i], middles: rest.filter((_, j) => j !== i) };
  };
  const out = [reading(t.at(-1), t.slice(0, -1))];
  if (t.length >= 3) out.push(reading(t.at(-2) + t.at(-1), t.slice(0, -2)));
  return out;
}

/* A given name plus its nickname-table equivalents, upper case (for substring search in alt text
 * and file names, where a word-level comparison is impossible). */
export function givenVariants(given) {
  const g = String(given || "").toUpperCase();
  return [g, ...(NICK.get(g) || [])];
}
function givenMatches(a, b) {
  if (a === b) return true;
  if (NICK.get(a)?.has(b)) return true;
  return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a));
}
function middlesConflict(a, b) {
  // Only initials both sides state can conflict; a missing middle name is not a conflict.
  const ia = a.map(x => x[0]), ib = b.map(x => x[0]);
  if (!ia.length || !ib.length) return false;
  return !ia.some(x => ib.includes(x));
}

/* True when an SEC reporting-owner name and a natural-order candidate name (plus aliases)
 * can only refer to the same person. */
export function samePerson(secName, candidateName, aliases = []) {
  if (isEntityName(secName)) return false;
  const sec = secNameReadings(secName);
  if (!sec.length) return false;
  for (const name of [candidateName, ...aliases]) {
    for (const c of naturalNameReadings(name)) {
      for (const s of sec) {
        if (s.surname !== c.surname) continue;
        if (!givenMatches(s.given, c.given) && !s.middles.some(m => m.length > 1 && givenMatches(m, c.given))) continue;
        if (middlesConflict(s.middles.filter(m => !givenMatches(m, c.given)), c.middles)) continue;
        return true;
      }
    }
  }
  return false;
}

/* SEC "LAST FIRST MIDDLE" -> "First Middle Last" for display. */
export function displaySecName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name || isEntityName(name) || /[a-z]/.test(name)) return name;
  const parts = name.split(" ");
  const suffix = /^(JR|SR|II|III|IV)\.?$/.test(parts.at(-1)) ? parts.pop() : "";
  const title = t => t.length === 1 ? t + "." : t.charAt(0) + t.slice(1).toLowerCase();
  return [...parts.slice(1).map(title), title(parts[0]), suffix && (suffix.length > 2 ? suffix : title(suffix) + ".")].filter(Boolean).join(" ");
}

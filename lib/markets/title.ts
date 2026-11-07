/* One formatter for every market title a person reads (the board, the homepage, the feed, the market page, the copy
 * ticket, the election cards): the exchange's raw question becomes plain English.
 *   "Will Paris Saint-Germain FC win on 2026-11-03?"  →  "PSG to win" · "today"
 *   "Spread: Cavaliers (-4.5)"                          →  "Cavaliers −4.5"
 *   "Will FC Bayern München win on 2026-11-04?"        →  "Bayern Munich to win" · "tomorrow"
 * Polymarket's groupItemTitle (the outcome's own short label) wins when present. ISO dates become relative days
 * ("today", "tomorrow", "yesterday", "Tue Nov 3"). Club names lose FC/CF/SC and take their common names. Pure; safe on
 * the client. */

interface HumanTitle { title: string; when: string | null }

/** Common names for clubs whose exchange names are long or formal. */
const CLUBS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bParis Saint[- ]Germain( FC)?\b/i, "PSG"],
  [/\b(FC )?Bayern (München|Munchen|Munich)\b/i, "Bayern Munich"],
  [/\bClub Atl[eé]tico de Madrid\b|\bAtl[eé]tico de Madrid\b/i, "Atlético Madrid"],
  [/\bClub Atl[eé]tico de ([A-Z][\wáéíóú]+)\b/, "Atlético $1"],
  [/\bReal Madrid CF\b/i, "Real Madrid"],
  [/\bFC Barcelona\b/i, "Barcelona"],
  [/\bFC Internazionale Milano\b|\bInternazionale\b/i, "Inter Milan"],
  [/\bBorussia Dortmund\b/i, "Dortmund"],
  [/\bBayer (04 )?Leverkusen\b/i, "Leverkusen"],
  [/\bManchester United( FC)?\b/i, "Man United"],
  [/\bManchester City( FC)?\b/i, "Man City"],
  [/\bTottenham Hotspur( FC)?\b/i, "Tottenham"],
  [/\bWolverhampton Wanderers( FC)?\b/i, "Wolves"],
  [/\bBrighton (&|and) Hove Albion( FC)?\b/i, "Brighton"],
  [/\bOlympique (de )?Marseille\b/i, "Marseille"],
  [/\bOlympique Lyonnais\b/i, "Lyon"],
  [/\bSporting (Clube de Portugal|CP)\b/i, "Sporting"],
  [/\bSport Lisboa e Benfica\b|\bSL Benfica\b/i, "Benfica"],
  [/\bFC Porto\b/i, "Porto"],
  [/\bAFC Ajax\b/i, "Ajax"],
  [/\bPSV Eindhoven\b/i, "PSV"],
  [/\bJuventus FC\b/i, "Juventus"],
  [/\bSSC Napoli\b/i, "Napoli"],
  [/\bAS Roma\b/i, "Roma"],
];

const DAY = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const etDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** "2026-11-03" → "today" / "tomorrow" / "yesterday" / "Tue, Nov 3" (US Eastern days). */
export function relativeDay(iso: string, now: number): string {
  const today = etDay(now), d = Date.parse(`${iso}T00:00:00Z`), t = Date.parse(`${today}T00:00:00Z`);
  const diff = Math.round((d - t) / DAY);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return WEEKDAY.format(new Date(d)).replace(",", "");
}

/** Club and team names as people say them: common names, no FC/CF/SC/AFC suffixes or prefixes. */
export function shortName(name: string): string {
  let s = name;
  for (const [re, to] of CLUBS) s = s.replace(re, to);
  s = s.replace(/\s+(FC|CF|SC|AFC|F\.C\.|C\.F\.)\b/g, "").replace(/^(FC|CF|SC)\s+/, "").replace(/\s{2,}/g, " ").trim();
  return s;
}

/** A market's title in plain English, with its date as a relative day (separate, so a surface can place it). */
export function humanTitle(input: { title: string; groupItemTitle?: string | null; now?: number }): HumanTitle {
  const now = input.now ?? Date.now();
  let t = (input.title ?? "").trim();
  let when: string | null = null;
  // The date, wherever it sits ("… on 2026-11-03?", "… (2026-11-03)", "… - 2026-11-03").
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso) {
    when = relativeDay(iso[1]!, now);
    t = t.replace(/\s*(?:on|by|for|[-–(])?\s*\b\d{4}-\d{2}-\d{2}\b\)?/, "").trim();
  }
  // Spreads: "Spread: Cavaliers (-4.5)" → "Cavaliers −4.5".
  const spread = /^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s*$/i.exec(t);
  if (spread) t = `${shortName(spread[1]!)} ${spread[2]!.replace(/^-/, "−").replace(/^(?=\d)/, "+")}`;
  // "Will X win?" → "X to win"; "Will X beat Y?" → "X to beat Y".
  const will = /^Will (?:the )?(.+?) (win|beat|defeat|advance|qualify|make the playoffs|be relegated|reach the final)(.*?)\??$/i.exec(t);
  if (will && !spread) t = `${shortName(will[1]!)} to ${will[2]!.toLowerCase()}${will[3]!.trim() ? ` ${shortName(will[3]!.trim())}` : ""}`;
  else if (!spread) t = shortName(t);
  // Polymarket's own short label for the outcome, when it has one and the title is still a question.
  const g = input.groupItemTitle?.trim();
  if (g && /^Will\b/i.test(t) && !/^\d{4}-\d{2}-\d{2}$/.test(g)) t = shortName(g);
  return { title: t.replace(/\s{2,}/g, " ").trim(), when };
}

/** The title with its day, for one-line surfaces: "PSG to win · today". */
export function humanLine(input: { title: string; groupItemTitle?: string | null; now?: number }): string {
  const h = humanTitle(input);
  return h.when ? `${h.title} · ${h.when}` : h.title;
}

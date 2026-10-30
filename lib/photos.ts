/* The photos (one Unsplash original per subject, served from Unsplash's image CDN by lib/unsplash.ts) and which one goes
 * where: every tracker's artwork, a card's subject when it has no logo, and the page slots (empty states, sheets, the
 * sign-in panel). One place, so no page shows the same photo twice in view. */
import type { PhotoN } from "@/components/Photo";

/** Header bands, by page (the feed's and a market's follow the tab; a profile's, the trader's best category). */
export const BAND = {
  feed: { sports: 2, markets: 9, stocks: 10 },
  market: { sports: 12, markets: 15, stocks: 10 },
  profile: { sports: 2, markets: 9, stocks: 10 },
  /* the product pages (/sports, /markets, /stocks, /how-it-works, /faq) */
  product: { sports: 2, markets: 9, stocks: 10 }, how: 15, faq: 4,
  top: 6, results: 3, following: 7, account: 5, alerts: 14, pricing: 8, signin: 6, about: 13, notFound: 5,
} as const satisfies Record<string, PhotoN | Record<string, PhotoN>>;

/** Small crops in empty states, sheets and in-page bands. */
export const SPOT = {
  feedEmpty: 12, resultsEmpty: 14, pageEmpty: 13, followingEmpty: 16, youreIn: 16,
  lock: 15, comingSoon: 13, comingSoonPage: 11, popup: 13,
  /* inside the home page's phone mockups: none of them is in the hero's slideshow above */
  phoneFeed: 9, phoneProfile: 10, phoneWallpaper: 16,
} as const satisfies Record<string, PhotoN>;

/** The photo in each slot: the subject of the page or column it sits in; pages about the product as a whole (account,
 *  pricing, track record, sign-in) use the trader and market photos. */
export const SLOT_PHOTO: Record<PhotoN, PhotoName> = {
  2: "home-sports", 3: "biggest-bets", 4: "home-markets", 5: "home-stocks", 6: "top-traders", 7: "home-sports", 8: "top-1-percent",
  9: "home-markets", 10: "home-stocks", 11: "early-money", 12: "home-sports", 13: "home-markets", 14: "late-money", 15: "home-markets", 16: "steam",
};

/** The thin strip on top of share cards and emails. */
export const STRIP = { move: 11, site: 16, siteTall: 15, email: 4 } as const satisfies Record<string, PhotoN>;

/* ---------- the subject photos: one Unsplash original per subject, loaded from images.unsplash.com ---------- */

/** Every photo by name: its Unsplash id, photographer (credited in the footer), the focal point every crop keeps in
 *  frame (fx, fy: 0..1 from the left and top; centre unless the subject sits elsewhere) and its colour while loading. */
export const PHOTOS = {
  "biggest-bets": { id: "1568430328012-21ed450453ea", user: "toddcravens", fx: 0.5, fy: 0.5, color: "#2a3b4c" },
  "top-traders": { id: "1651341050677-24dba59ce0fd", user: "polarmermaid", fx: 0.5, fy: 0.5, color: "#3a3f46" },
  "top-1-percent": { id: "1561833726-f7edc0273b68", user: "ruddymedia", fx: 0.5, fy: 0.5, color: "#33363c" },
  "underdog-hunters": { id: "1552072092-7f9b8d63efcb", user: "attentieattentie", fx: 0.5, fy: 0.5, color: "#4a5a3a" },
  "favorites-only": { id: "1507514604110-ba3347c457f6", user: "cadop", fx: 0.5, fy: 0.5, color: "#5a4a3a" },
  "early-money": { id: "1749794747527-bcd8999e5fd1", user: "shutter_speed_", fx: 0.5, fy: 0.5, color: "#c9a77a" },
  "late-money": { id: "1728659964407-ed9a942ec2de", user: "yashzucced", fx: 0.5, fy: 0.5, color: "#2b2a3a" },
  steam: { id: "1672545701317-5177e9f41166", user: "goldenplover31", fx: 0.5, fy: 0.5, color: "#3c4650" },
  "new-wallets": { id: "1579014134953-1580d7f123f3", user: "emkal", fx: 0.5, fy: 0.5, color: "#4b4640" },
  nfl: { id: "1566577739112-5180d4bf9390", user: "aussiedave", fx: 0.5, fy: 0.5, color: "#3f6b3a" },
  nba: { id: "1546519638-68e109498ffc", user: "markusspiske", fx: 0.5, fy: 0.5, color: "#8a5a3a" },
  mlb: { id: "1475440197469-e367ec8eeb19", user: "jcpeacock", fx: 0.5, fy: 0.5, color: "#4f7a3e" },
  nhl: { id: "1545471977-94cac22e71ed", user: "markusspiske", fx: 0.5, fy: 0.5, color: "#c9d3da" },
  "college-football": { id: "1781650104690-a5309d91a26b", user: "sgreer", fx: 0.5, fy: 0.5, color: "#3d6634" },
  "college-basketball": { id: "1765924705648-9a0731ac5202", user: "tom_macret", fx: 0.5, fy: 0.5, color: "#7a5236" },
  soccer: { id: "1587329310686-91414b8e3cb7", user: "chaossoccergear", fx: 0.5, fy: 0.5, color: "#3f7a3c" },
  "premier-league": { id: "1577214250705-d5c24d76ea0c", user: "whodunelson", fx: 0.5, fy: 0.5, color: "#3a6b3a" },
  "champions-league": { id: "1767916732786-a83902ffc25c", user: "zaki_0711", fx: 0.5, fy: 0.5, color: "#1f2d4a" },
  "la-liga": { id: "1674760726595-d12f5e45482a", user: "patuflinx", fx: 0.5, fy: 0.5, color: "#3c6e3c" },
  "serie-a": { id: "1693517393451-a71a593c9870", user: "zachr1992", fx: 0.5, fy: 0.5, color: "#2f5e36" },
  ufc: { id: "1738982518593-316b17348c30", user: "hasanmajed__", fx: 0.5, fy: 0.5, color: "#2a2a2e" },
  tennis: { id: "1554068865-24cecd4e34b8", user: "arnok", fx: 0.5, fy: 0.5, color: "#3f6aa0" },
  golf: { id: "1604608147284-139feed06f4c", user: "webpixum", fx: 0.5, fy: 0.5, color: "#5f8a4a" },
  esports: { id: "1504450758481-7338eba7524a", user: "jcgellidon", fx: 0.5, fy: 0.5, color: "#2a2140" },
  "fed-and-rates": { id: "1633059050703-0f1b50828402", user: "joshuaworoniecki", fx: 0.5, fy: 0.5, color: "#8a8d92" },
  "elections-2026": { id: "1520525003249-2b9cdda513bc", user: "angelvela", fx: 0.5, fy: 0.5, color: "#5a6478" },
  geopolitics: { id: "1590274853856-f22d5ee3d228", user: "matreding", fx: 0.5, fy: 0.5, color: "#3a4d63" },
  "tech-and-ai": { id: "1782338938777-908f4e1db3be", user: "brechtcorbeel", fx: 0.5, fy: 0.5, color: "#1f2833" },
  culture: { id: "1533174072545-7a4b6ad7a6c3", user: "dannyhowe", fx: 0.5, fy: 0.5, color: "#5a3a4a" },
  "crypto-prices": { id: "1623227413711-25ee4388dae3", user: "kanchanara", fx: 0.5, fy: 0.5, color: "#6b5a2a" },
  "ceo-buys": { id: "1610374792793-f016b77ca51a", user: "yibeigeng", fx: 0.5, fy: 0.5, color: "#3a3f48" },
  "cluster-buys": { id: "1722299547563-03e2d21fe289", user: "zoshuacolah", fx: 0.5, fy: 0.5, color: "#40464f" },
  "big-funds": { id: "1586815634274-bf5eb51055c9", user: "bylolo", fx: 0.5, fy: 0.5, color: "#3b4350" },
  "home-stocks": { id: "1631216166880-9e9b51577962", user: "eidsvold", fx: 0.5, fy: 0.5, color: "#26323f" },
  "home-markets": { id: "1581097543550-b3cbe2e6ea6e", user: "haroldrmendoza", fx: 0.5, fy: 0.5, color: "#3a4250" },
  "home-sports": { id: "1679391029864-d46f366a456b", user: "howardbouchevereau", fx: 0.5, fy: 0.5, color: "#36553a" },
} as const;
export type PhotoName = keyof typeof PHOTOS;
export interface PhotoInfo { id: string; user: string; fx: number; fy: number; color: string }
export const photoInfo = (name: PhotoName): PhotoInfo => PHOTOS[name];

/** Each photographer once, for the footer credits. */
export const PHOTOGRAPHERS: readonly string[] = [...new Set(Object.values(PHOTOS).map(p => p.user))];

/** A tracker's photo: its own, under its slug (the league trackers drop "-big-money"). */
export const trackerPhoto = (slug: string): PhotoName => {
  const n = slug.replace(/-big-money$/, "");
  return (n in PHOTOS ? n : "home-markets") as PhotoName;
};

const LEAGUE_PHOTO: Array<[RegExp, PhotoName]> = [
  [/^nfl$/i, "nfl"], [/^nba$|wnba/i, "nba"], [/^mlb$/i, "mlb"], [/^nhl$/i, "nhl"],
  [/college football|ncaaf|cfb/i, "college-football"], [/college basketball|ncaab|cbb|march madness/i, "college-basketball"],
  [/premier league|epl/i, "premier-league"], [/champions league|ucl/i, "champions-league"], [/la ?liga/i, "la-liga"], [/serie a/i, "serie-a"],
  [/ufc|mma/i, "ufc"], [/tennis|atp|wta|wimbledon|us open|french open|australian open/i, "tennis"], [/golf|pga|masters|ryder/i, "golf"],
  [/counter-strike|dota|league of legends|valorant|rocket league|call of duty|esports|cs2|lol/i, "esports"],
  [/soccer|mls|bundesliga|ligue 1|world cup|fifa|uefa|football club/i, "soccer"],
];

/** A topic from a market's own words, when the venue gave no category. */
const TOPIC_TEXT: Array<[RegExp, PhotoName]> = [
  [/bitcoin|ethereum|solana|crypto|\b(btc|eth|xrp|doge)\b/i, "crypto-prices"],
  [/election|president|senate|house|governor|mayor|primary|nominee|democrat|republican|vote|ballot|poll/i, "elections-2026"],
  [/war|ceasefire|invade|invasion|nato|russia|ukraine|china|taiwan|israel|iran|gaza|sanction|treaty|summit/i, "geopolitics"],
  [/\bai\b|openai|gpt|nvidia|apple|google|microsoft|tesla|spacex|chip|iphone|launch|tech/i, "tech-and-ai"],
  [/oscar|grammy|emmy|album|movie|box office|song|billboard|netflix|celebrity|award/i, "culture"],
];

/** The thumbnail for a move: its league's photo (sports), its topic's (politics → elections, world → geopolitics, the
 *  Fed, tech, culture, crypto), CEO Buys for a Form 4 and Big Funds for a 13F; else its column's home photo. */
export function subjectPhoto(m: { tab: string; source?: string; category?: string | null; leagueLabel?: string | null; league?: string | null; text?: string; detailKind?: string | null }): PhotoName {
  if (m.tab === "stocks" || m.source === "sec") return m.detailKind === "fund" ? "big-funds" : m.detailKind === "insider" ? "ceo-buys" : "home-stocks";
  if (m.tab === "crypto" || m.category === "crypto") return "crypto-prices";
  if (m.tab === "sports") {
    for (const l of [m.leagueLabel, m.league]) if (l) for (const [re, p] of LEAGUE_PHOTO) if (re.test(l)) return p;
    return "home-sports";
  }
  if (m.text && /(^|[^a-z])(fed|fomc|powell)([^a-z]|$)|interest rate|rate cut|rate hike|federal reserve/i.test(m.text)) return "fed-and-rates";
  if (!m.category && m.text) for (const [re, p] of TOPIC_TEXT) if (re.test(m.text)) return p;
  const byCategory: Record<string, PhotoName> = { politics: "elections-2026", geopolitics: "geopolitics", world: "geopolitics", economy: "fed-and-rates", tech: "tech-and-ai", science: "tech-and-ai", culture: "culture", crypto: "crypto-prices" };
  return (m.category && byCategory[m.category]) || "home-markets";
}

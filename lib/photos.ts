/* Which photo (components/Photo.tsx, public/hero) goes where. One place, so no page shows the same photo twice in view:
 * each page's header band, its empty state and the sheets that can open over it all use different photos, and the
 * fifteen rotate through the hero, the bands, empty states and share cards. */
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

/** The thin strip on top of share cards and emails. */
export const STRIP = { move: 11, site: 16, siteTall: 15, email: 4 } as const satisfies Record<string, PhotoN>;

/* ---------- the subject photos (scripts/hero-photos.sh, public/photos): one Unsplash original per subject ---------- */

/** Every photo by name, with its Unsplash id and photographer (credited in the footer). */
export const PHOTOS = {
  "biggest-bets": { id: "1568430328012-21ed450453ea", user: "toddcravens" },
  "top-traders": { id: "1651341050677-24dba59ce0fd", user: "polarmermaid" },
  "top-1-percent": { id: "1561833726-f7edc0273b68", user: "ruddymedia" },
  "underdog-hunters": { id: "1552072092-7f9b8d63efcb", user: "attentieattentie" },
  "favorites-only": { id: "1507514604110-ba3347c457f6", user: "cadop" },
  "early-money": { id: "1749794747527-bcd8999e5fd1", user: "shutter_speed_" },
  "late-money": { id: "1728659964407-ed9a942ec2de", user: "yashzucced" },
  steam: { id: "1672545701317-5177e9f41166", user: "goldenplover31" },
  "new-wallets": { id: "1579014134953-1580d7f123f3", user: "emkal" },
  nfl: { id: "1566577739112-5180d4bf9390", user: "aussiedave" },
  nba: { id: "1546519638-68e109498ffc", user: "markusspiske" },
  mlb: { id: "1475440197469-e367ec8eeb19", user: "jcpeacock" },
  nhl: { id: "1545471977-94cac22e71ed", user: "markusspiske" },
  "college-football": { id: "1781650104690-a5309d91a26b", user: "sgreer" },
  "college-basketball": { id: "1765924705648-9a0731ac5202", user: "tom_macret" },
  soccer: { id: "1587329310686-91414b8e3cb7", user: "chaossoccergear" },
  "premier-league": { id: "1577214250705-d5c24d76ea0c", user: "whodunelson" },
  "champions-league": { id: "1767916732786-a83902ffc25c", user: "zaki_0711" },
  "la-liga": { id: "1674760726595-d12f5e45482a", user: "patuflinx" },
  "serie-a": { id: "1693517393451-a71a593c9870", user: "zachr1992" },
  ufc: { id: "1738982518593-316b17348c30", user: "hasanmajed__" },
  tennis: { id: "1554068865-24cecd4e34b8", user: "arnok" },
  golf: { id: "1604608147284-139feed06f4c", user: "webpixum" },
  esports: { id: "1504450758481-7338eba7524a", user: "jcgellidon" },
  "fed-and-rates": { id: "1633059050703-0f1b50828402", user: "joshuaworoniecki" },
  "elections-2026": { id: "1520525003249-2b9cdda513bc", user: "angelvela" },
  geopolitics: { id: "1590274853856-f22d5ee3d228", user: "matreding" },
  "tech-and-ai": { id: "1782338938777-908f4e1db3be", user: "brechtcorbeel" },
  culture: { id: "1533174072545-7a4b6ad7a6c3", user: "dannyhowe" },
  "crypto-prices": { id: "1623227413711-25ee4388dae3", user: "kanchanara" },
  "ceo-buys": { id: "1610374792793-f016b77ca51a", user: "yibeigeng" },
  "cluster-buys": { id: "1722299547563-03e2d21fe289", user: "zoshuacolah" },
  "big-funds": { id: "1586815634274-bf5eb51055c9", user: "bylolo" },
  "home-stocks": { id: "1631216166880-9e9b51577962", user: "eidsvold" },
  "home-markets": { id: "1581097543550-b3cbe2e6ea6e", user: "haroldrmendoza" },
  "home-sports": { id: "1679391029864-d46f366a456b", user: "howardbouchevereau" },
} as const;
export type PhotoName = keyof typeof PHOTOS;

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
  const byCategory: Record<string, PhotoName> = { politics: "elections-2026", geopolitics: "geopolitics", world: "geopolitics", economy: "fed-and-rates", tech: "tech-and-ai", science: "tech-and-ai", culture: "culture", crypto: "crypto-prices" };
  return (m.category && byCategory[m.category]) || "home-markets";
}

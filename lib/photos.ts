/* Which photo (components/Photo.tsx, public/hero) goes where. One place, so no page shows the same photo twice in view:
 * each page's header band, its empty state and the sheets that can open over it all use different photos, and the
 * fifteen rotate through the hero, the bands, empty states and share cards. */
import type { PhotoN } from "@/components/Photo";

/** The home hero's slideshow, in order: the first loads with the page. None of the home page's photo
 *  sections (HOME_SECTIONS) or phone screens repeats one of these. */
export const HERO_PHOTOS: PhotoN[] = [5, 2, 11, 4, 12, 15, 14];

/** The home page's full-bleed photo sections, top to bottom (components/home/PhotoSection.tsx). */
export const HOME_SECTIONS = { seconds: 7, wins: 3, alert: 8, yourMove: 6 } as const satisfies Record<string, PhotoN>;

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

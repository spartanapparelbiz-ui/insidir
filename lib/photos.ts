/* Which photo (components/Photo.tsx, public/hero) goes where. One place, so no page shows the same photo twice in view:
 * each page's header band, its empty state and the sheets that can open over it all use different photos, and the
 * sixteen rotate through the hero, the bands, empty states and share cards. */
import type { PhotoN } from "@/components/Photo";

/** The home hero's slideshow, in order: photo 1 first (it loads with the page), ending on the summit. */
export const HERO_PHOTOS: PhotoN[] = [1, 2, 11, 3, 12, 5, 15, 6];

/** Header bands, by page (the feed's switches with the tab). */
export const BAND = {
  feed: { sports: 2, markets: 9, stocks: 10 },
  top: 6, results: 3, following: 7, account: 1, pricing: 8, signin: 6, about: 13, notFound: 1,
} as const satisfies Record<string, PhotoN | Record<string, PhotoN>>;

/** Small crops in empty states, sheets and in-page bands. */
export const SPOT = {
  feedEmpty: 12, resultsEmpty: 14, pageEmpty: 13, followingEmpty: 16, youreIn: 16,
  lock: 15, comingSoon: 13, comingSoonPage: 11,
} as const satisfies Record<string, PhotoN>;

/** The thin strip on top of share cards and emails. */
export const STRIP = { move: 11, profile: 13, site: 15, email: 4 } as const satisfies Record<string, PhotoN>;

/* The brand photos (public/brand/*.jpg). Every page, card and thumbnail picks its picture here, served through next/image
 * (AVIF or WebP at the width the screen needs; components/brand/BrandImage.tsx adds the grade that makes them one set).
 *
 * Each master was checked by eye at full size for warped structures, melted shapes or garbled text before it was added.
 * The set that arrived had 20 files: 4 were exact duplicates of others (kept once), 3 never reached the repository
 * (a desert concert, Europe at night from orbit, a rocket launch over the sea), so 13 masters are here. Slots without a
 * photo of their own use the nearest related one; FALLBACK lists them so they can be swapped when a photo lands. */

import palette from "./palette.json";

export type PhotoFile = "hero" | "cta" | "markets" | "politics" | "tech" | "oil" | "hurricane" | "racing" | "tennis" | "baseball" | "basketball" | "soccer" | "golf";

export interface Photo {
  src: `/brand/${PhotoFile}.jpg`; alt: string; width: 6144; height: 3458; /** Mean colour, the placeholder while it loads. */ tone: string;
  /** Where its subject is (CSS object-position), so a small crop keeps it in frame. */
  pos: string;
  /** Its ambient colour (scripts/brand-palette.ts → lib/brand/palette.json): cards tint themselves with it. */
  ambient: string;
}

/** Each photo's subject, by eye: the stadium, the hoop, the hurricane's eye, the rig, the White House, the court… */
const POS: Record<PhotoFile, string> = {
  hero: "50% 80%", cta: "50% 78%", markets: "60% 75%", politics: "60% 80%", tech: "70% 75%", oil: "66% 75%", hurricane: "30% 45%",
  racing: "50% 60%", tennis: "40% 55%", baseball: "55% 75%", basketball: "60% 55%", soccer: "75% 75%", golf: "40% 55%",
};
const AMBIENT = palette as Record<string, string>;

/** 6K masters (6144×3458): each 1672px original upscaled 4× with Real-ESRGAN (x4plus), then resized to 6144 wide, and
 *  compared with its original at 100%. Racing, baseball, soccer, politics and golf are 60% the upscale and 40% a plain resize of the
 *  original: on its own the model smeared their city lights and stands into paint, speckled the White House trees and clumped the golf trees. */
const SIZE = { width: 6144, height: 3458 } as const;

const photo = (file: PhotoFile, alt: string, tone: string): Photo => ({ src: `/brand/${file}.jpg`, alt, ...SIZE, tone, pos: POS[file], ambient: AMBIENT[file] ?? tone });

export const PHOTOS: Record<PhotoFile, Photo> = {
  hero: photo("hero", "A misty valley at dusk, the last orange light on the horizon", "#141a2e"),
  cta: photo("cta", "A sea of clouds under a deep blue sky, a thin orange horizon", "#14213f"),
  markets: photo("markets", "Manhattan's towers rising out of morning fog at sunrise", "#7a7e8c"),
  politics: photo("politics", "The White House lit at dusk across a misty lawn", "#14244a"),
  tech: photo("tech", "A data centre glowing at night in a desert valley", "#101218"),
  oil: photo("oil", "An offshore oil platform flaring against a red sunset", "#5a2d3a"),
  hurricane: photo("hurricane", "A hurricane's eye seen from orbit", "#2e4466"),
  racing: photo("racing", "A street circuit's light trails below a city skyline at night", "#141c1e"),
  tennis: photo("tennis", "A clay tennis court from above, in late sun between trees", "#5a3a1a"),
  baseball: photo("baseball", "A lit baseball stadium below a city skyline at sunset", "#2a2f52"),
  basketball: photo("basketball", "A basketball hoop on a cliff above the sea at sunset", "#6b4a35"),
  soccer: photo("soccer", "A floodlit football stadium in heavy rain at night", "#141a18"),
  golf: photo("golf", "A golf course in morning mist with the sun through the trees", "#8a8a6a"),
};

/** The page slots: what each section of the site sits on. */
export type Slot = "hero" | "cta" | "markets" | "space" | "world";
export const SLOT: Record<Slot, PhotoFile> = { hero: "hero", cta: "cta", markets: "markets", space: "hurricane", world: "racing" };

/** Slots and categories using a related photo until their own arrives (shown in the pull request, kept honest here):
 *  nearest first. A row of cards takes the first one no other card in it uses (categoryPhotos). */
export const FALLBACKS: Readonly<Record<string, readonly PhotoFile[]>> = {
  space: ["hurricane", "cta"], world: ["racing", "markets", "hurricane"], culture: ["racing", "markets"], elections: ["politics", "markets"],
  football: ["soccer", "baseball"], hockey: ["baseball", "soccer"], weather: ["cta", "hurricane"],
};
export const FALLBACK: Readonly<Record<string, PhotoFile>> = Object.fromEntries(Object.entries(FALLBACKS).map(([k, v]) => [k, v[0]!]));

export const slotPhoto = (s: Slot): Photo => PHOTOS[SLOT[s]];

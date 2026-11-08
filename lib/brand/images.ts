/* The brand photos (public/brand/*.jpg). Every page, card and thumbnail picks its picture here, served through next/image
 * (AVIF or WebP at the width the screen needs; components/brand/BrandImage.tsx adds the grade that makes them one set).
 *
 * Each master was checked by eye at full size for warped structures, melted shapes or garbled text before it was added.
 * The set that arrived had 20 files: 4 were exact duplicates of others (kept once), 3 never reached the repository
 * (a desert concert, Europe at night from orbit, a rocket launch over the sea), so 13 masters are here. Slots without a
 * photo of their own use the nearest related one; FALLBACK lists them so they can be swapped when a photo lands. */

import palette from "./palette.json";

export type PhotoFile = "hero" | "cta" | "markets" | "politics" | "tech" | "oil" | "hurricane" | "racing" | "tennis" | "baseball" | "basketball" | "soccer" | "golf"
  | "football" | "hockey" | "esports" | "elections" | "world" | "culture" | "space"
  | "street" | "diner" | "press" | "stadium" | "capitol";

/** Where a photo comes from and its license, listed on /credits (CC BY and CC BY-SA need the credit shown). */
export interface PhotoCredit { by: string; source: string; license: string; licenseUrl: string }

export interface Photo {
  src: `/brand/${PhotoFile}.jpg`; alt: string; width: 6144; height: 3458; /** Mean colour, the placeholder while it loads. */ tone: string;
  /** Where its subject is (CSS object-position), so a small crop keeps it in frame. */
  pos: string;
  /** Its ambient colour (scripts/brand-palette.ts → lib/brand/palette.json): cards tint themselves with it. */
  ambient: string;
  credit?: PhotoCredit;
}

/** Each photo's subject, by eye: the stadium, the hoop, the hurricane's eye, the rig, the White House, the court… */
const POS: Record<PhotoFile, string> = {
  hero: "50% 80%", cta: "50% 78%", markets: "60% 75%", politics: "60% 80%", tech: "70% 75%", oil: "66% 75%", hurricane: "30% 45%",
  racing: "50% 60%", tennis: "40% 55%", baseball: "55% 75%", basketball: "30% 40%", soccer: "75% 75%", golf: "40% 55%",
  football: "50% 60%", hockey: "80% 45%", esports: "50% 55%", elections: "50% 40%", world: "50% 70%", culture: "50% 60%", space: "64% 60%",
  street: "50% 80%", diner: "50% 75%", press: "50% 85%", stadium: "50% 75%", capitol: "45% 72%",
};
const AMBIENT = palette as Record<string, string>;

/** 6K masters (6144×3458): each 1672px original upscaled 4× with Real-ESRGAN (x4plus), then resized to 6144 wide, and
 *  compared with its original at 100%. Racing, baseball, soccer, politics and golf are 60% the upscale and 40% a plain resize of the
 *  original: on its own the model smeared their city lights and stands into paint, speckled the White House trees and clumped the golf trees. */
const SIZE = { width: 6144, height: 3458 } as const;

const photo = (file: PhotoFile, alt: string, tone: string, credit?: PhotoCredit): Photo => ({ src: `/brand/${file}.jpg`, alt, ...SIZE, tone, pos: POS[file], ambient: AMBIENT[file] ?? tone, ...(credit ? { credit } : {}) });
const UNSPLASH = { license: "Unsplash License", licenseUrl: "https://unsplash.com/license" } as const;
const unsplash = (by: string, id: string): PhotoCredit => ({ by, source: `https://unsplash.com/photos/${id}`, ...UNSPLASH });

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
  // Markus Spiske on Unsplash (Unsplash License), 5650px original: a real arena, the ball dropping through the net.
  basketball: photo("basketball", "A basketball dropping through the net in a dark arena", "#1c1512", { by: "Markus Spiske", source: "https://unsplash.com/@markusspiske", ...UNSPLASH }),
  soccer: photo("soccer", "A floodlit football stadium in heavy rain at night", "#141a18"),
  golf: photo("golf", "A golf course in morning mist with the sun through the trees", "#8a8a6a"),
  /* Categories that showed a plain grey card until 2026-11-06. Each is a real photo, cropped to 6144×3458 from an
   * original at least 6144 wide (the launch: 8192), checked by eye. Hockey is cropped in from an 8000px original so
   * no team sponsor's logo is in frame (a referee's patch is). */
  football: photo("football", "A packed college football stadium under the lights at night", "#2a2418", unsplash("sgreer", "1781650104690-a5309d91a26b")),
  hockey: photo("hockey", "A faceoff: skates and a dropped puck on the ice", "#c8ccd0", unsplash("markusspiske", "1545471977-94cac22e71ed")),
  esports: photo("esports", "A full arena lit magenta around an esports stage", "#2a1a30", unsplash("jcgellidon", "1504450758481-7338eba7524a")),
  elections: photo("elections", "The United States Capitol's dome under a blue sky", "#6a7a98", unsplash("angelvela", "1520525003249-2b9cdda513bc")),
  world: photo("world", "The avenue of flags outside the United Nations in Geneva", "#6a7468", unsplash("matreding", "1590274853856-f22d5ee3d228")),
  culture: photo("culture", "A concert crowd under falling confetti and stage lights", "#1a1614", unsplash("dannyhowe", "1533174072545-7a4b6ad7a6c3")),
  space: photo("space", "A rocket's launch streak arcing over the water at night, Kennedy Space Center", "#141a2a",
    { by: "NASA/Frank Michaux", source: "https://images.nasa.gov/details/KSC-20250115-PH-FMX02_0001", license: "Public domain (NASA)", licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/" }),
  /* Landing art (2026-11-07): five generated night scenes in one mood (rain, sodium light, people at work), each from a
   * 1672×941 original, checked by eye. Street, diner and press: upscaled 4× with Real-ESRGAN (x4plus), resized to 6144.
   * Stadium and capitol: a Lanczos resize with a light sharpen for now (CPU upscaling took 20 minutes a photo); swap in
   * an upscale when one is made. */
  street: photo("street", "People crossing a rain-wet street between towers at dusk, taxis behind them", "#242428"),
  diner: photo("diner", "Two people at a diner's window counter at night, rain on the glass", "#1a1b1b"),
  press: photo("press", "Camera crews on the steps of a columned building at night", "#2d2c30"),
  stadium: photo("stadium", "A crowd walking toward a floodlit stadium in the rain", "#2a353e"),
  capitol: photo("capitol", "Journalists packing up between columns, the Capitol dome lit behind them", "#29272a"),
};

/** The page slots: what each section of the site sits on. */
export type Slot = "hero" | "cta" | "markets" | "space" | "world" | "spotlight" | "stake" | "election" | "why" | "free" | "gaps" | "faq";
/** space: the landing's record and the legal pages · world: pricing · spotlight, stake, election, why, free, gaps, faq: those landing stages. */
export const SLOT: Record<Slot, PhotoFile> = {
  hero: "hero", cta: "cta", markets: "markets", space: "press", world: "diner", spotlight: "street", stake: "stadium", election: "capitol",
  why: "markets", free: "cta", gaps: "tech", faq: "politics",
};

/** Slots and categories using a related photo until their own arrives (shown in the pull request, kept honest here):
 *  nearest first. A row of cards takes the first one no other card in it uses (categoryPhotos). */
export const FALLBACKS: Readonly<Record<string, readonly PhotoFile[]>> = {
  weather: ["cta", "hurricane"],
};
export const FALLBACK: Readonly<Record<string, PhotoFile>> = Object.fromEntries(Object.entries(FALLBACKS).map(([k, v]) => [k, v[0]!]));

export const slotPhoto = (s: Slot): Photo => PHOTOS[SLOT[s]];

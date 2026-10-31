/* Credits (/credits): every photo with its photographer and license (lib/photos.ts PHOTOS, all from Unsplash), every
 * logo source with its package license (scripts/logos.mjs PKG; licenses as published on npm), and the typeface. */
import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { PHOTOS } from "@/lib/photos";

export const metadata: Metadata = { title: "Credits", description: "Every photo, logo and typeface on Insidir, with its source and license." };

/** What each photo illustrates, from its name ("college-football" → "College football"). */
const label = (name: string): string => { const s = name.replace(/^home-/, "Home: ").replace(/-/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

/** The logo packages scripts/logos.mjs builds public/logos from, with the license each publishes on npm. */
const LOGO_SOURCES = [
  { pkg: "simple-icons", version: "16.36.0", license: "CC0-1.0", what: "FIFA, F1, esports titles, single-colour league marks, company and coin marks" },
  { pkg: "sports-assets", version: "0.9.0", license: "MIT", what: "Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, UFC, college football" },
  { pkg: "nba-team-logos", version: "3.8.0", license: "ISC", what: "NBA and every NBA team" },
  { pkg: "nfl-team-logos", version: "1.5.0", license: "ISC", what: "NFL and every NFL team" },
  { pkg: "react-mlb-logos", version: "1.1.2", license: "ISC", what: "MLB and every MLB team" },
  { pkg: "nhl-team-logos", version: "1.2.0", license: "ISC", what: "NHL and every NHL team" },
  { pkg: "us-stock-logos", version: "1.0.0", license: "MIT", what: "US-listed companies, by ticker" },
] as const;

export default function CreditsPage() {
  const photos = Object.entries(PHOTOS);
  return (
    <TrustPage path="/credits" title="Credits" cta={false}
      lead="Every photo, logo and typeface on Insidir, where it comes from, and the license we use it under. We never use photos of the people behind wallets, and never AI images of real people.">
      <h2>Photos</h2>
      <p>All {photos.length} photos are from Unsplash, used under the <a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">Unsplash License</a>, and served from Unsplash&apos;s own image service.</p>
      <ul className="credits" data-testid="credits-photos">
        {photos.map(([name, p]) => (
          <li key={name}>
            <span>{label(name)}</span>{" "}
            <a href={`https://unsplash.com/photos/${p.id}`} target="_blank" rel="noopener noreferrer">photo</a> by{" "}
            <a href={`https://unsplash.com/@${p.user}`} target="_blank" rel="noopener noreferrer">@{p.user}</a>
          </li>
        ))}
      </ul>

      <h2>Logos</h2>
      <p>League, team, company and coin logos are the trademarks of their owners, shown only to say which one a position is about. No endorsement is implied. They come from these open-source packages:</p>
      <ul className="credits" data-testid="credits-logos">
        {LOGO_SOURCES.map(s => (
          <li key={s.pkg}><a href={`https://www.npmjs.com/package/${s.pkg}/v/${s.version}`} target="_blank" rel="noopener noreferrer">{s.pkg} {s.version}</a> ({s.license}): {s.what}</li>
        ))}
      </ul>

      <h2>Typeface</h2>
      <p><a href="https://fonts.google.com/specimen/Schibsted+Grotesk" target="_blank" rel="noopener noreferrer">Schibsted Grotesk</a> by Schibsted Media, under the <a href="https://openfontlicense.org" target="_blank" rel="noopener noreferrer">SIL Open Font License 1.1</a>.</p>

      <h2>Screens</h2>
      <p>The recordings of Insidir itself are ours.</p>
    </TrustPage>
  );
}

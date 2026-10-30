/* Logos (public/logos, lib/logos.ts): a team's, a league's, a company's or a coin's, always whole. A white tile with a
 * 1px #EAEAEE ring and 22% corners, the logo contained at 76% of it, centred; never cropped, never in a coloured frame.
 * A matchup is both teams as two overlapping white circles; a Form 4 is the company's tile with the insider as a
 * small circle on its corner. Sizes come from the row (app/polish.css: 56px on desktop, 48px on phones). */
export function Logo({ src, className }: { src: string; className?: string }) {
  return (
    <span className={`logo${className ? ` ${className}` : ""}`}>
      <img src={src} alt="" width={128} height={128} decoding="async" />
    </span>
  );
}

/** Both teams of a game: the first top-left, the second bottom-right. */
export function Matchup({ a, b, className }: { a: string; b: string; className?: string }) {
  return (
    <span className={`matchup${className ? ` ${className}` : ""}`}>
      <span className="matchup__team matchup__team--a"><img src={a} alt="" width={128} height={128} decoding="async" /></span>
      <span className="matchup__team matchup__team--b"><img src={b} alt="" width={128} height={128} decoding="async" /></span>
    </span>
  );
}

/** A Form 4: the company's logo, the insider on its corner (their monogram until there's a licensed photo). */
export function FilingLogo({ src, mono, className }: { src: string; mono: string; className?: string }) {
  return (
    <span className={`filing${className ? ` ${className}` : ""}`}>
      <Logo src={src} />
      <span className="filing__who" aria-hidden="true">{mono}</span>
    </span>
  );
}

/** A company in a row: its logo when we have one, else its initials on the same white tile (never a broken image). */
export function CompanyMark({ src, initials, className }: { src: string | null; initials: string; className?: string }) {
  return src ? <Logo src={src} className={className} /> : <span className={`logo logo--mono${className ? ` ${className}` : ""}`} aria-hidden="true">{initials}</span>;
}

/* Team marks from the registry (lib/teams): the self-hosted, normalized logo (128 or 256px file for the size shown, so
 * it is always at least twice its display size), a light neutral disc behind a dark mark so nothing vanishes on black,
 * and a clean monogram (the abbreviation in the team's colour on a neutral disc) when there is no logo. Never a broken
 * or borrowed image. Server and client safe. */
import type { CSSProperties } from "react";
import { discInk, monogram, type TeamArt } from "@/lib/teams/mark";

export function TeamLogo({ team, size = 32, eager = false }: { team: TeamArt; size?: number; eager?: boolean }) {
  const style = { width: size, height: size, "--ink": discInk(team.color) } as CSSProperties;
  if (!team.logo) {
    const scale = size >= 64 ? " s-team--mono-l" : size >= 40 ? " s-team--mono-m" : "";
    return <span className={`s-team s-team--mono${scale}`} style={style} role="img" aria-label={team.name} data-testid="team-mark" data-mark="monogram" data-team={`${team.league}:${team.abbr}`}>
      <span className="s-team__mono">{monogram(team)}</span>
    </span>;
  }
  const file = size * 2 <= 128 ? 128 : 256;
  return (
    <span className={`s-team${team.dark ? " s-team--disc" : ""}`} style={style} data-testid="team-mark" data-mark="logo" data-team={`${team.league}:${team.abbr}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, self-hosted files (scripts/teams-sync.ts) */}
      <img src={`${team.logo}-${file}.webp`} srcSet={`${team.logo}-128.webp 128w, ${team.logo}-256.webp 256w`} sizes={`${size}px`} width={size} height={size} alt={team.name}
        loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}

/** The market hero's lockup: both logos at 96px, "vs" between, the team names under them. */
export function Matchup({ teams, size = 96 }: { teams: [TeamArt, TeamArt]; size?: number }) {
  return (
    <div className="s-matchup" data-testid="matchup">
      {teams.map((t, i) => (
        <div key={t.abbr + i} className="s-matchup__side" style={{ order: i === 0 ? 0 : 2 }}>
          <TeamLogo team={t} size={size} eager />
          <span className="s-matchup__name">{t.short}</span>
        </div>
      ))}
      <span className="s-matchup__vs" style={{ order: 1 }}>vs</span>
    </div>
  );
}

/** Both teams small, for rows and tickets (28–32px). */
export function TeamPair({ teams, size = 28 }: { teams: [TeamArt, TeamArt]; size?: number }) {
  return <span className="s-teampair" data-testid="team-pair"><TeamLogo team={teams[0]} size={size} /><TeamLogo team={teams[1]} size={size} /></span>;
}

/* /admin/art: every team logo in the registry (lib/teams, by league) and every candidate headshot (lib/brand/people) at
 * 28, 48 and 96px on black, with each one's source, so a person can look at all of them at once and catch a bad one.
 * One set per view (?set=nba, …, ?set=people). Admin only. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { allTeams } from "@/lib/teams";
import { PEOPLE, portraitSrc } from "@/lib/brand/people";
import { TeamLogo } from "@/components/system/Team";
import { Face, Party } from "@/components/system";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Art", robots: { index: false, follow: false } };

const SIZES = [28, 48, 96] as const;

export default async function ArtAdmin({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) {
    return <main className="b-root"><section className="b-stage"><div className="b-stage__in"><h1 className="b-h2">Art</h1><p className="b-sub">Sign in on <a className="s-link" href="/admin">/admin</a> first.</p></div></section></main>;
  }
  const leagues = allTeams();
  const set = (await searchParams).set ?? "nba";
  const people = PEOPLE.filter(p => p.file);
  const league = leagues.find(l => l.league === set);
  const count = (l: (typeof leagues)[number]) => `${l.teams.filter(t => t.logo).length}/${l.teams.length}`;
  return (
    <main className="b-root" data-testid="admin-art">
      <section className="b-stage"><div className="b-stage__in">
        <div className="b-head">
          <h1 className="b-h2">Logos and faces</h1>
          <p className="b-sub">Every team logo and candidate portrait we can show, at 28, 48 and 96px on black. Logos: self-hosted, trimmed and sized to the same optical weight (scripts/teams-sync.ts). Portraits: face-cropped to one head size and eye line (scripts/people-sync.py). A team without a usable logo gets its monogram; a candidate without a verified portrait, initials.</p>
          <p className="b-small" data-testid="art-sets">
            {leagues.map(l => <span key={l.league}><a className="s-link" href={`/admin/art?set=${l.league}`} aria-current={l.league === set ? "page" : undefined}>{l.label} {count(l)}</a> · </span>)}
            <a className="s-link" href="/admin/art?set=people" aria-current={set === "people" ? "page" : undefined}>Candidates {people.length}/{PEOPLE.length}</a>
          </p>
        </div>
        {league ? (
          <ol className="s-art" data-testid="art-teams">
            {league.teams.map(t => (
              <li key={t.abbr} className="s-art__tile" data-testid="art-tile" data-mark={t.logo ? "logo" : "monogram"} data-dark={t.dark ? "1" : undefined}>
                <span className="s-art__row">{SIZES.map(s => <TeamLogo key={s} team={t} size={s} eager />)}</span>
                <span className="b-small"><b>{t.name}</b> · {t.abbr.toUpperCase()}{t.dark ? " · on a disc" : ""}{t.logo ? "" : " · monogram"}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {set === "people" ? (
          <ol className="s-art" data-testid="art-people">
            {PEOPLE.map(p => (
              <li key={`${p.name}-${p.state}`} className="s-art__tile" data-testid="art-tile" data-mark={p.file ? "photo" : "initials"}>
                <span className="s-art__row">{SIZES.map(s => <Face key={s} name={p.name} src={p.file ? portraitSrc(p, s) : null} size={s} eager />)}<Party party={p.party} /></span>
                <span className="b-small"><b>{p.name}</b> · {p.office} · {p.kind ?? "initials"}{p.license ? ` · ${p.license}` : ""}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div></section>
    </main>
  );
}

/* A league tracker's own mark in white (public/logos/marks, scripts/logos.mjs: single-colour, so its cut-outs stay cut
 * out), shown small beside its name on the tracker page header only; the tracker's artwork is always its photo. Leagues
 * without a clean single-colour mark (NFL, college football, La Liga, Serie A, Champions League) show the name alone.
 * No imports, so it is safe anywhere; test/logos.test.ts checks every file is there. */
const MARK: Record<string, string> = {
  "nba-big-money": "/logos/marks/nba.svg", "mlb-big-money": "/logos/marks/mlb.svg", "nhl-big-money": "/logos/marks/nhl.svg",
  "premier-league": "/logos/marks/epl.svg", ufc: "/logos/marks/ufc.svg", "soccer-big-money": "/logos/marks/fifa.svg",
};
export const TRACKER_LOGOS: Readonly<Record<string, string>> = MARK;
export const trackerLogo = (slug: string): string | null => MARK[slug] ?? null;

/* A market's imagery row (lib/sky/art.ts): two team logos side by side, portraits or monograms in party rings, D and R
 * rings for a party market, a league or brand logo, or a line icon. Every piece has a designed fallback. */
import { artFor, type Art as ArtT } from "@/lib/sky/art";
import { Avatar } from "./Avatar";

export function Art({ art, size = 40 }: { art: ArtT; size?: number }) {
  switch (art.kind) {
    case "teams": return <span className="sk-art">{art.teams.map(t => <Avatar key={t.src} src={t.src} name={t.name} kind="logo" size={size} />)}</span>;
    case "people": return <span className="sk-art">{art.people.map(p => <Avatar key={p.name} src={p.src} name={p.name} kind="portrait" party={p.party} size={size} />)}</span>;
    case "parties": return <span className="sk-art">{art.parties.map(p => <Avatar key={p} src={null} name={p} kind="mono" party={p} size={size} />)}</span>;
    case "logo": return <span className="sk-art"><Avatar src={art.src} name={art.name} kind="logo" size={size} /></span>;
    case "icon": return <span className="sk-art"><Avatar src={null} name={art.name} kind="icon" icon={art.icon} size={size} /></span>;
  }
}

export function MarketArt(props: Parameters<typeof artFor>[0] & { size?: number }) {
  return <Art art={artFor(props)} size={props.size} />;
}

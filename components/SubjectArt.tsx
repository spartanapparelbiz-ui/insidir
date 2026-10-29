/* The picture for a subject, drawn in thin white line on the cover's deep colour: the field, court, rink or pitch for a
 * league, the octagon, the court, the green; the Fed's columns, a ballot box, a globe, a chip, a film strip, a chain of
 * blocks for the topics; a Form 4 sheet, a stack of filings, a fund's holdings for stocks; and for the styles what they
 * follow (the whale, the podium, the long shot's target, the early sun, the late clock). Drawn in code (no photo to
 * fail or go blank, no logos, no faces), in a 400 × 300 box that crops clean to 4:3, 16:9, 21:9 and 1:1. Decorative:
 * always aria-hidden. Names match lib/photos.ts (PHOTOS), plus "home" for the product itself. */
import type { ReactNode } from "react";
import type { PhotoName } from "@/lib/photos";

export type ArtSubject = PhotoName | "home";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const mirror = (el: ReactNode) => <g transform="translate(400 0) scale(-1 1)">{el}</g>;

const gridiron = (
  <>
    <rect x="20" y="50" width="360" height="200" />
    {range(11).map(i => <line key={i} x1={56 + i * 28.8} y1="50" x2={56 + i * 28.8} y2="250" />)}
    {range(10).map(i => <g key={`h${i}`}><line x1={70.4 + i * 28.8} y1="130" x2={70.4 + i * 28.8} y2="138" /><line x1={70.4 + i * 28.8} y1="162" x2={70.4 + i * 28.8} y2="170" /></g>)}
    <path d="M20 150 H8 M8 122 V178" /><path d="M380 150 H392 M392 122 V178" />
    <ellipse cx="200" cy="150" rx="22" ry="13" /><path d="M190 150 H210 M195 146 V154 M200 146 V154 M205 146 V154" />
  </>
);
const court = (
  <>
    <rect x="20" y="50" width="360" height="200" /><line x1="200" y1="50" x2="200" y2="250" /><circle cx="200" cy="150" r="28" />
    {[<g key="l"><rect x="20" y="114" width="72" height="72" /><circle cx="92" cy="150" r="28" /><path d="M20 66 H56 A92 92 0 0 1 56 234 H20" /><circle cx="34" cy="150" r="5" /><line x1="28" y1="138" x2="28" y2="162" /></g>]}
    {mirror(<g><rect x="20" y="114" width="72" height="72" /><circle cx="92" cy="150" r="28" /><path d="M20 66 H56 A92 92 0 0 1 56 234 H20" /><circle cx="34" cy="150" r="5" /><line x1="28" y1="138" x2="28" y2="162" /></g>)}
  </>
);
const diamond = (
  <>
    <path d="M200 262 L40 102 M200 262 L360 102" /><path d="M40 102 Q200 -46 360 102" />
    <path d="M200 252 L286 166 L200 80 L114 166 Z" /><path d="M128 180 Q200 70 272 180" /><circle cx="200" cy="168" r="10" />
    <rect x="281" y="161" width="10" height="10" transform="rotate(45 286 166)" /><rect x="195" y="75" width="10" height="10" transform="rotate(45 200 80)" />
    <rect x="109" y="161" width="10" height="10" transform="rotate(45 114 166)" /><path d="M194 248 H206 V256 L200 262 L194 256 Z" />
  </>
);
const rinkHalf = <g><line x1="150" y1="52" x2="150" y2="248" /><circle cx="86" cy="108" r="22" /><circle cx="86" cy="192" r="22" /><line x1="44" y1="60" x2="44" y2="240" /><path d="M44 138 A12 12 0 0 1 44 162" /></g>;
const rink = (
  <>
    <rect x="20" y="52" width="360" height="196" rx="62" /><line x1="200" y1="52" x2="200" y2="248" /><circle cx="200" cy="150" r="28" /><circle cx="200" cy="150" r="2" />
    {rinkHalf}{mirror(rinkHalf)}
  </>
);
const pitchHalf = <g><rect x="20" y="88" width="56" height="124" /><rect x="20" y="122" width="20" height="56" /><path d="M76 126 A32 32 0 0 1 76 174" /><circle cx="60" cy="150" r="2" /><rect x="12" y="136" width="8" height="28" /></g>;
const pitch = (
  <>
    <rect x="20" y="50" width="360" height="200" /><line x1="200" y1="50" x2="200" y2="250" /><circle cx="200" cy="150" r="34" /><circle cx="200" cy="150" r="2" />
    {pitchHalf}{mirror(pitchHalf)}
  </>
);
const pitchStars = (
  <>
    {pitch}
    {range(8).map(i => { const a = (i / 8) * Math.PI * 2; return <circle key={i} cx={200 + Math.cos(a) * 20} cy={150 + Math.sin(a) * 20} r="2.5" />; })}
  </>
);
const octagonPts = (r: number) => range(8).map(i => { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; return `${(200 + Math.cos(a) * r).toFixed(1)},${(150 + Math.sin(a) * r).toFixed(1)}`; }).join(" ");
const octagon = (<><polygon points={octagonPts(128)} /><polygon points={octagonPts(108)} /><circle cx="200" cy="150" r="22" /></>);
const tennis = (
  <>
    <rect x="30" y="50" width="340" height="200" /><path d="M30 76 H370 M30 224 H370" /><path d="M118 76 V224 M282 76 V224 M118 150 H282" />
    <line x1="200" y1="42" x2="200" y2="258" strokeWidth="2.5" /><circle cx="248" cy="112" r="9" /><path d="M241 106 Q248 112 241 118 M255 106 Q248 112 255 118" />
  </>
);
const golf = (
  <>
    <path d="M64 196 C60 150 130 118 210 122 C300 126 350 158 336 196 C322 236 230 250 160 244 C100 238 68 226 64 196 Z" />
    <path d="M100 196 C100 166 150 146 210 148 C276 150 306 172 298 196 C290 220 226 228 172 224 C126 220 100 214 100 196 Z" />
    <ellipse cx="226" cy="190" rx="10" ry="4" /><line x1="226" y1="190" x2="226" y2="70" /><path d="M226 70 L276 86 L226 102" /><circle cx="150" cy="206" r="4" />
  </>
);
const controller = (
  <>
    <path d="M128 112 H272 C316 112 344 150 352 196 C358 232 330 250 306 234 L270 206 H130 L94 234 C70 250 42 232 48 196 C56 150 84 112 128 112 Z" />
    <path d="M118 150 V178 M104 164 H132" /><circle cx="272" cy="152" r="6" /><circle cx="292" cy="170" r="6" /><circle cx="252" cy="170" r="6" /><circle cx="272" cy="188" r="6" />
    <circle cx="166" cy="194" r="12" /><circle cx="234" cy="194" r="12" /><path d="M184 136 H216" />
  </>
);
const columns = (
  <>
    <path d="M86 112 L200 58 L314 112 Z" /><rect x="86" y="112" width="228" height="14" />
    {range(6).map(i => <g key={i}><line x1={104 + i * 38} y1="126" x2={104 + i * 38} y2="228" /><line x1={118 + i * 38} y1="126" x2={118 + i * 38} y2="228" /></g>)}
    <rect x="80" y="228" width="240" height="10" /><rect x="68" y="238" width="264" height="12" />
  </>
);
const ballot = (
  <>
    <rect x="164" y="64" width="72" height="92" /><path d="M180 104 L194 118 L222 88" /><path d="M176 136 H224 M176 146 H212" />
    <path d="M116 150 H284 L296 252 H104 Z" /><line x1="150" y1="150" x2="250" y2="150" strokeWidth="3" /><path d="M116 150 L132 126 H268 L284 150" />
  </>
);
const globe = (
  <>
    <circle cx="200" cy="150" r="108" /><ellipse cx="200" cy="150" rx="44" ry="108" /><ellipse cx="200" cy="150" rx="84" ry="108" /><line x1="200" y1="42" x2="200" y2="258" />
    <line x1="92" y1="150" x2="308" y2="150" /><path d="M110 96 Q200 116 290 96 M110 204 Q200 184 290 204" />
  </>
);
const chip = (
  <>
    <rect x="138" y="88" width="124" height="124" rx="10" /><rect x="164" y="114" width="72" height="72" rx="4" /><path d="M182 132 H218 V168 H182 Z" />
    {range(6).map(i => { const p = 102 + i * 19.2; return <g key={i}><line x1={p} y1="66" x2={p} y2="88" /><line x1={p} y1="212" x2={p} y2="234" /><line x1="116" y1={p} x2="138" y2={p} /><line x1="262" y1={p} x2="284" y2={p} /></g>; })}
  </>
);
const film = (
  <>
    <rect x="24" y="92" width="352" height="116" /><path d="M24 112 H376 M24 188 H376" />
    {range(16).map(i => <g key={i}><rect x={32 + i * 22} y="98" width="10" height="8" /><rect x={32 + i * 22} y="194" width="10" height="8" /></g>)}
    {range(4).map(i => <rect key={`f${i}`} x={36 + i * 86} y="120" width="72" height="60" />)}
  </>
);
const hexPts = (cx: number, cy: number, r: number) => range(6).map(i => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`; }).join(" ");
const chain = (
  <>
    {[100, 200, 300].map(x => <g key={x}><polygon points={hexPts(x, 150, 44)} /><polygon points={hexPts(x, 150, 26)} /></g>)}
    <path d="M138 150 H162 M238 150 H262" />
  </>
);
const candles = (
  <>
    {[[50, 196, 226, 180, 238], [82, 188, 214, 172, 228], [114, 170, 204, 156, 214], [146, 178, 198, 166, 210], [178, 150, 184, 136, 192],
      [210, 132, 166, 118, 176], [242, 140, 160, 126, 172], [274, 108, 142, 94, 152], [306, 88, 120, 72, 130], [338, 66, 98, 52, 108]].map(([x, top, bottom, hi, lo]) => (
      <g key={x}><line x1={x} y1={hi} x2={x} y2={lo} /><rect x={x! - 8} y={top} width="16" height={bottom! - top!} /></g>
    ))}
    <line x1="24" y1="250" x2="376" y2="250" />
  </>
);
const filing = (
  <>
    <path d="M128 48 H246 L278 80 V252 H128 Z" /><path d="M246 48 V80 H278" /><path d="M148 92 H226 M148 110 H256 M148 128 H240" />
    <path d="M148 226 L178 204 L200 214 L230 180 L256 166" /><path d="M244 164 H256 V176" /><line x1="148" y1="236" x2="258" y2="236" />
  </>
);
const filings = (
  <>
    <path d="M92 76 H178 L200 98 V234 H92 Z" /><path d="M222 76 H308 V234 H200" /><path d="M286 76 L308 98" />
    <path d="M150 58 H246 L274 86 V252 H150 Z" fill="var(--tc, #2b1d45)" /><path d="M246 58 V86 H274" /><path d="M170 102 H236 M170 120 H254 M170 138 H240" />
    <path d="M170 224 L194 204 L214 212 L236 184 L254 174" /><path d="M243 172 H254 V183" />
  </>
);
const donut = (
  <>
    <circle cx="200" cy="150" r="104" /><circle cx="200" cy="150" r="58" />
    {[0, 0.34, 0.56, 0.72, 0.86].map(f => { const a = f * Math.PI * 2 - Math.PI / 2; return <line key={f} x1={200 + Math.cos(a) * 58} y1={150 + Math.sin(a) * 58} x2={200 + Math.cos(a) * 104} y2={150 + Math.sin(a) * 104} />; })}
    <path d="M200 46 A104 104 0 0 1 285.8 208.6 L247.9 182.6 A58 58 0 0 0 200 92 Z" fill="currentColor" fillOpacity="0.18" />
  </>
);
const odds = (
  <>
    <path d="M24 214 L72 206 L100 182 L140 190 L176 150 L214 160 L250 118 L286 128 L320 90 L376 76" />
    {[[100, 182, 6], [176, 150, 11], [250, 118, 8], [320, 90, 15]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}
    <path d="M24 250 H376 M24 50 H376" strokeDasharray="3 6" /><path d="M24 150 H376" strokeDasharray="1 8" />
  </>
);
const product = (
  <>
    <path d="M24 226 C80 222 104 196 140 194 C182 192 196 150 236 140 C280 128 300 96 376 70" />
    {[[60, 224, 5], [140, 194, 12], [236, 140, 8], [300, 104, 16], [356, 76, 6]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}
    <line x1="24" y1="250" x2="376" y2="250" />
  </>
);
const stadium = (
  <>
    <ellipse cx="200" cy="196" rx="168" ry="56" /><ellipse cx="200" cy="196" rx="120" ry="34" /><ellipse cx="200" cy="196" rx="70" ry="18" />
    {[44, 356].map(x => <g key={x}><line x1={x} y1="196" x2={x} y2="62" /><rect x={x - 16} y="46" width="32" height="16" /><path d={`M${x - 10} 54 H${x + 10}`} /></g>)}
    <path d="M32 196 V214 C32 240 368 240 368 214 V196" />
  </>
);
const whale = (
  <>
    <path d="M54 176 C70 120 170 104 252 128 C286 138 306 150 322 140 L346 104 L352 146 L384 160 L344 168 C326 196 290 212 236 216 C150 222 72 212 54 176 Z" />
    <path d="M70 186 C120 198 190 198 250 190" /><circle cx="104" cy="160" r="3.5" /><path d="M118 112 C112 92 100 82 86 78 M118 112 C122 92 134 80 148 76 M118 112 V84" />
    <path d="M24 244 Q64 232 104 244 T184 244 T264 244 T344 244" />
  </>
);
const podium = (
  <>
    <rect x="152" y="128" width="96" height="122" /><rect x="64" y="172" width="88" height="78" /><rect x="248" y="196" width="88" height="54" />
    <path d="M200 64 L210 86 L234 88 L216 104 L222 128 L200 116 L178 128 L184 104 L166 88 L190 86 Z" /><line x1="40" y1="250" x2="360" y2="250" />
  </>
);
const topBars = (
  <>
    {[24, 30, 40, 52, 46, 60, 70, 64, 82, 94, 108, 122, 140].map((h, i) => <rect key={i} x={32 + i * 26} y={250 - h} width="16" height={h} />)}
    <rect x="344" y="70" width="16" height="180" fill="currentColor" fillOpacity="0.35" /><path d="M352 52 L352 34 M340 46 L352 34 L364 46" />
    <line x1="24" y1="250" x2="376" y2="250" />
  </>
);
const target = (
  <>
    <circle cx="292" cy="150" r="86" /><circle cx="292" cy="150" r="58" /><circle cx="292" cy="150" r="30" /><circle cx="292" cy="150" r="6" />
    <path d="M36 236 L286 154" /><path d="M286 154 L268 152 M286 154 L276 168" /><path d="M36 236 L28 222 M36 236 L22 240 M48 232 L40 218 M48 232 L34 236" />
  </>
);
const medal = (
  <>
    <path d="M150 40 L188 120 M250 40 L212 120 M174 40 L200 96 L226 40" /><circle cx="200" cy="178" r="64" /><circle cx="200" cy="178" r="46" />
    <path d="M200 148 L209 168 L230 170 L214 184 L219 206 L200 194 L181 206 L186 184 L170 170 L191 168 Z" />
  </>
);
const sunrise = (
  <>
    <path d="M110 206 A90 90 0 0 1 290 206" /><path d="M146 206 A54 54 0 0 1 254 206" /><line x1="24" y1="206" x2="376" y2="206" />
    {range(9).map(i => { const a = Math.PI + (i / 8) * Math.PI; return <line key={i} x1={200 + Math.cos(a) * 106} y1={206 + Math.sin(a) * 106} x2={200 + Math.cos(a) * 132} y2={206 + Math.sin(a) * 132} />; })}
    <path d="M60 232 H340 M110 254 H290" />
  </>
);
const clock = (
  <>
    <circle cx="200" cy="150" r="104" /><circle cx="200" cy="150" r="90" />
    {range(12).map(i => { const a = (i / 12) * Math.PI * 2; const r1 = i % 3 === 0 ? 70 : 78; return <line key={i} x1={200 + Math.sin(a) * r1} y1={150 - Math.cos(a) * r1} x2={200 + Math.sin(a) * 86} y2={150 - Math.cos(a) * 86} />; })}
    <line x1="200" y1="150" x2={200 + Math.sin(-0.06) * 74} y2={150 - Math.cos(-0.06) * 74} strokeWidth="2.5" /><line x1="200" y1="150" x2={200 + Math.sin(-0.5) * 50} y2={150 - Math.cos(-0.5) * 50} strokeWidth="2.5" />
    <circle cx="200" cy="150" r="4" />
  </>
);
const momentum = (
  <>
    {[0, 34, 68].map(d => <path key={d} d={`M${90 + d} ${226 - d} L${190 + d} ${126 - d} M${150 + d} ${126 - d} H${190 + d} V${166 - d}`} />)}
    <path d="M40 236 H120 M56 214 H118 M72 192 H116" /><line x1="24" y1="250" x2="376" y2="250" />
  </>
);
const wallet = (
  <>
    <path d="M100 112 L256 72 L270 112" /><rect x="88" y="112" width="224" height="132" rx="14" /><rect x="236" y="154" width="76" height="48" rx="10" /><circle cx="262" cy="178" r="7" />
    <path d="M330 60 V92 M314 76 H346" /><path d="M354 104 V118 M347 111 H361" />
  </>
);

const ART: Record<ArtSubject, ReactNode> = {
  "biggest-bets": whale, "top-traders": podium, "top-1-percent": topBars, "underdog-hunters": target, "favorites-only": medal,
  "early-money": sunrise, "late-money": clock, steam: momentum, "new-wallets": wallet,
  nfl: gridiron, "college-football": gridiron, nba: court, "college-basketball": court, mlb: diamond, nhl: rink,
  soccer: pitch, "premier-league": pitch, "champions-league": pitchStars, "la-liga": pitch, "serie-a": pitch,
  ufc: octagon, tennis, golf, esports: controller,
  "fed-and-rates": columns, "elections-2026": ballot, geopolitics: globe, "tech-and-ai": chip, culture: film, "crypto-prices": chain,
  "ceo-buys": filing, "cluster-buys": filings, "big-funds": donut, "home-stocks": candles, "home-markets": odds, "home-sports": stadium, home: product,
};

/** Every subject drawn, for tests. */
export const ART_SUBJECTS = Object.keys(ART) as ArtSubject[];

export function SubjectArt({ subject, className, crop = "cover" }: { subject: ArtSubject; className?: string;
  /** How the drawing fills its box: "cover" fills and crops (bands, covers), "contain" shows it whole (thumbs). */
  crop?: "cover" | "contain" }) {
  return (
    <svg className={`art${className ? ` ${className}` : ""}`} viewBox="0 0 400 300" preserveAspectRatio={crop === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-subject={subject}>
      {ART[subject]}
    </svg>
  );
}

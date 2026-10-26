/* How it works, in three line drawings (inline SVG, 1.5px strokes, Paper and Steel only): the math, not decoration.
 * (1) the same game on two apps at different prices, (2) one tap on each app, one side each, (3) $1 comes back either
 * way and the gap is yours. The numbers are a worked example, labelled as one. No venue logos: plain names. */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Phone({ x, name, side, price, tap = false }: { x: number; name: string; side: string; price: string; tap?: boolean }) {
  return (
    <g transform={`translate(${x} 8)`}>
      <rect {...S} x="0" y="0" width="92" height="144" rx="12" className="st-line" />
      <text x="12" y="26" className="st-small">{name}</text>
      <text x="12" y="52" className="st-text">Jets win?</text>
      <rect {...S} x="10" y="68" width="72" height="34" rx="6" className={tap ? "st-strong" : "st-line"} />
      <text x="18" y="90" className="st-text">{side}</text>
      <text x="74" y="90" textAnchor="end" className="st-num">{price}</text>
      {tap ? <path {...S} d="M84 112 l-6 -10 m6 10 l8 -4 m-8 4 v14" className="st-strong" /> : null}
    </g>
  );
}

const PANELS = [
  {
    title: "Two apps price the same game differently",
    text: "Kalshi sells YES at 55¢. Polymarket sells NO on the same game at 40¢.",
    art: (
      <>
        <Phone x={24} name="Kalshi" side="YES" price="55¢" />
        <Phone x={144} name="Polymarket" side="NO" price="40¢" />
      </>
    ),
  },
  {
    title: "Buy one side on each",
    text: "Two taps: YES on one app, NO on the other. One of them is sure to pay $1.",
    art: (
      <>
        <Phone x={24} name="Kalshi" side="YES" price="55¢" tap />
        <Phone x={144} name="Polymarket" side="NO" price="40¢" tap />
      </>
    ),
  },
  {
    title: "$1 comes back. The gap is yours",
    text: "95¢ in, $1 back whoever wins. You keep the 5¢ left over, minus fees.",
    art: (
      <>
        <rect {...S} x="20" y="40" width="220" height="30" rx="4" className="st-line" />
        <line {...S} x1="124" y1="40" x2="124" y2="70" className="st-line" />
        <line {...S} x1="209" y1="40" x2="209" y2="70" className="st-line" />
        <text x="72" y="60" textAnchor="middle" className="st-num">55¢</text>
        <text x="166" y="60" textAnchor="middle" className="st-num">40¢</text>
        <text x="20" y="28" className="st-small">$1 paid out</text>
        <path {...S} d="M224 74 v34" className="st-strong" />
        <path {...S} d="M218 100 l6 8 6-8" className="st-strong" />
        <rect {...S} x="176" y="114" width="64" height="30" rx="4" className="st-strong" />
        <text x="208" y="134" textAnchor="middle" className="st-num st-keep">5¢</text>
        <text x="168" y="134" textAnchor="end" className="st-text">Left over</text>
      </>
    ),
  },
];

export function Steps() {
  return (
    <section className="sec" data-section="how" aria-labelledby="how-h">
      <h2 id="how-h" className="sec__h">How it works</h2>
      <ol className="steps">
        {PANELS.map((p, i) => (
          <li key={p.title} className="steps__item">
            <svg className="steps__art" viewBox="0 0 260 160" role="img" aria-label={`Step ${i + 1}: ${p.text}`}>{p.art}</svg>
            <h3 className="steps__h"><span className="steps__n mono">{i + 1}</span>{p.title}</h3>
            <p className="steps__p">{p.text}</p>
          </li>
        ))}
      </ol>
      <p className="small muted">A worked example. Real deals, with fees and fillable size, are on the Terminal.</p>
    </section>
  );
}

/* The insidir logo, always inline SVG (never a raster): the interlocking-brackets mark (64×64 viewBox) and the wordmark
 * "insidir" in Outfit 700, letter-spacing −0.02em. White on dark. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="currentColor">
      <rect x="0" y="0" width="40" height="18" /><rect x="0" y="0" width="18" height="46" /><rect x="46" y="18" width="18" height="46" /><rect x="24" y="46" width="40" height="18" />
    </svg>
  );
}

export function Logo({ size = 22, href = "/" }: { size?: number; href?: string | null }) {
  const inner = <><Mark size={size} /><span className="sk-word">insidir</span></>;
  return href ? <a className="sk-logo" href={href} aria-label="insidir home">{inner}</a> : <span className="sk-logo">{inner}</span>;
}

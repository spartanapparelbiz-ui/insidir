/* The brackets mark (64×64: two L-brackets) and "insidir" in Outfit 700, white. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" fill="currentColor">
      <rect x="0" y="0" width="40" height="18" /><rect x="0" y="0" width="18" height="46" />
      <rect x="46" y="18" width="18" height="46" /><rect x="24" y="46" width="40" height="18" />
    </svg>
  );
}

export function BrandLogo({ href = "/", label = "Insidir home" }: { href?: string | null; label?: string }) {
  const inner = <><Mark /><span>insidir</span></>;
  return href ? <a className="b-logo" href={href} aria-label={label}>{inner}</a> : <span className="b-logo">{inner}</span>;
}

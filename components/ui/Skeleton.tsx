/* Loading placeholders in the real layout's shape (never spinners for content, never a jump when it arrives).
 * Pass the same row/column structure the content will have. */
export function SkeletonLine({ w = "100%", h = 14 }: { w?: number | string; h?: number }) {
  return <span className="uiskel" style={{ width: w, height: h }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 3, cols = 4, label = "Loading" }: { rows?: number; cols?: number; label?: string }) {
  return (
    <div className="uiskel-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="uiskel-row">{Array.from({ length: cols }, (_, j) => <SkeletonLine key={j} w={j === 0 ? "40%" : "60%"} />)}</div>
      ))}
    </div>
  );
}

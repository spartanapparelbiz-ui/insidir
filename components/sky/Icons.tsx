/* Line icons for markets without a logo or portrait: 1.5px strokes in ice (#8FB8FF), drawn on a raised circle by
 * components/sky/Art.tsx. 24×24. */
import type { IconName } from "@/lib/sky/art";

const PATHS: Record<IconName, string> = {
  capitol: "M12 3v2M9 8a3 3 0 0 1 6 0M6 11h12M7 11v7M10 11v7M14 11v7M17 11v7M4 20h16M8 8h8v3H8z",
  ballot: "M5 10h14l-1 10H6zM8 10V5h8v5M10 7.5l1.5 1.5L14 6",
  chart: "M4 19h16M6 15l4-4 3 3 5-6M18 8h-3M18 8v3",
  bank: "M3 9l9-5 9 5M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6",
};

export function LineIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

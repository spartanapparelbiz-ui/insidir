/* Line icons for the /edgar page: 1.6px strokes, currentColor, 24px grid. Decorative (aria-hidden). */
const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const IconGrid = () => <I d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />;
export const IconBell = () => <I d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />;
export const IconList = () => <I d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />;
export const IconBolt = () => <I d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />;
export const IconBook = () => <I d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5" />;
export const IconLayers = () => <I d="m12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />;
export const IconSearch = () => <I d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />;
export const IconArrow = () => <I d="M5 12h14M13 6l6 6-6 6" />;
export const IconTick = () => <I d="M20 6 9 17l-5-5" />;

/** The app tab bar's icons (also drawn inside the home page's phone mockups, components/home/Story.tsx). */
export function TabIcon({ name, className = "tabbar__icon" }: { name: string; className?: string }) {
  const d: Record<string, string> = {
    Discover: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
    Trackers: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    Feed: "M4 6h16M4 12h16M4 18h10",
    Activity: "M3 12h4l3-8 4 16 3-8h4",
    Following: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
    Top: "M5 20V10M12 20V4M19 20v-7",
    Check: "M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2zM9 10l2 2 4-4",
    Account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

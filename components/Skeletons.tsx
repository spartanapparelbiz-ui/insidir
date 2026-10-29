/* Loading states in the shape of the real page (app/<route>/loading.tsx), so nothing jumps when the content lands:
 * the black bar with the logo, a serif-sized title, chips, and move cards / profile tiles / list rows as grey bars.
 * Never a blank screen or a spinner. One status line for screen readers.
 * Not on /top and /results: their filters are links to the same page, and a route-level loading boundary makes
 * Next drop those navigations; there the current page stays on screen until the filtered one is ready. */
import { SkeletonLine } from "@/components/ui/Skeleton";
import { Wordmark } from "@/components/Wordmark";

function Bar() {
  return (
    <header className="nav" aria-hidden="true">
      <div className="wrap nav__in"><span className="wordmark"><Wordmark /></span></div>
    </header>
  );
}

export function MoveSkeleton() {
  return (
    <div className="move move--skel" aria-hidden="true">
      <div className="move__top"><SkeletonLine w={110} h={26} /><SkeletonLine w={56} h={12} /></div>
      <SkeletonLine w="92%" h={20} /><SkeletonLine w="64%" h={20} />
      <SkeletonLine w="55%" h={14} />
      <div className="move__foot"><SkeletonLine w={92} h={40} /><SkeletonLine w={110} h={40} /></div>
    </div>
  );
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <Bar />
      <main className="wrap app2 skel dark" aria-busy="true">
        <p className="sr-only" role="status">{label}</p>
        {children}
      </main>
    </>
  );
}

export function FeedSkeleton({ title = 132 }: { title?: number }) {
  return (
    <Shell label="Loading the live feed">
      <div className="pband" aria-hidden="true"><div className="wrap pband__in"><SkeletonLine w={title} h={36} /></div></div>
      <div className="chips">{[64, 64, 72].map((w, i) => <SkeletonLine key={i} w={w} h={40} />)}</div>
      <ol className="feed2__list">{[0, 1, 2].map(i => <li key={i}><MoveSkeleton /></li>)}</ol>
    </Shell>
  );
}

export function ProfileSkeleton() {
  return (
    <Shell label="Loading the profile">
      <div className="trader__head skel__band"><div><SkeletonLine w={120} h={14} /><div style={{ height: 12 }} /><SkeletonLine w={260} h={44} /></div></div>
      <div className="record record--wide skel__tiles">{[0, 1, 2, 3].map(i => <div key={i}><SkeletonLine w="60%" h={12} /><div style={{ height: 8 }} /><SkeletonLine w="80%" h={24} /></div>)}</div>
      <ol className="feed2__list">{[0, 1].map(i => <li key={i}><MoveSkeleton /></li>)}</ol>
    </Shell>
  );
}

export function ListSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <Shell label={label}>
      <SkeletonLine w={200} h={36} />
      <div className="chips">{[80, 80, 72].map((w, i) => <SkeletonLine key={i} w={w} h={40} />)}</div>
      <ol className="toplist skel__list">{Array.from({ length: rows }, (_, i) => (
        <li key={i} className="toplist__row"><SkeletonLine w={20} h={16} /><span className="toplist__who"><SkeletonLine w="70%" h={16} /><SkeletonLine w="45%" h={12} /></span><SkeletonLine w={64} h={16} /></li>
      ))}</ol>
    </Shell>
  );
}

/** /trackers: the title, then cover cards. */
export function TrackersSkeleton() {
  return (
    <>
      <Bar />
      <main className="wrap app2 trackers skel" aria-busy="true">
        <p className="sr-only" role="status">Loading trackers</p>
        <div className="phead" aria-hidden="true"><SkeletonLine w={260} h={56} /><SkeletonLine w="70%" h={16} /></div>
        <ul className="tgrid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="ttile"><span className="ttile__cover skel__cover" /><span className="ttile__body"><SkeletonLine w="50%" h={22} /><SkeletonLine w="80%" h={14} /></span></li>
          ))}
        </ul>
      </main>
    </>
  );
}

/** A tracker: the cover and title, the record tiles, move cards. */
export function TrackerSkeleton() {
  return (
    <>
      <Bar />
      <main className="wrap app2 tracker skel" aria-busy="true">
        <p className="sr-only" role="status">Loading tracker</p>
        <div className="thead" aria-hidden="true">
          <span className="thead__cover skel__cover" />
          <div className="thead__copy"><SkeletonLine w={90} h={14} /><SkeletonLine w="80%" h={48} /><SkeletonLine w="60%" h={16} /><SkeletonLine w={120} h={48} /></div>
        </div>
        <div className="tsec" aria-hidden="true">
          <div className="record tstats">{Array.from({ length: 5 }, (_, i) => <div key={i}><SkeletonLine w="60%" h={28} /><SkeletonLine w="40%" h={12} /></div>)}</div>
        </div>
        <div className="tsec feed2__list tmoves" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <MoveSkeleton key={i} />)}</div>
      </main>
    </>
  );
}

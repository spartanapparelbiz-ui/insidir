/* /markets: every category, each a glass-framed photo with its live line (millionaire money today, or this week). */
import { BrandPicture } from "@/components/brand/BrandPicture";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, categoryPhotos } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { liveCategories } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets", description: "Every market people bet on, with the millionaire money in each." };

export default async function Markets() {
  const viewer = await getViewer(), now = Date.now();
  const live = hasDatabase() ? await liveCategories(getDb(), now).catch(() => ({ window: "day" as const, list: [] })) : { window: "day" as const, list: [] };
  const by = new Map(live.list.map(c => [c.slug, c]));
  const order = [...CATEGORIES].sort((a, b) => (by.get(b.slug)?.millionaire ?? 0) + (by.get(b.slug)?.pro ?? 0) / 10 - ((by.get(a.slug)?.millionaire ?? 0) + (by.get(a.slug)?.pro ?? 0) / 10));
  const photos = categoryPhotos(order.map(c => c.slug));
  const when = live.window === "day" ? "today" : "this week";
  const top = order[0] ? by.get(order[0].slug) : undefined;
  const insight = top?.millionaire ? `${order[0]!.name} drew ${dollars(top.millionaire)} of millionaire money ${when}.` : null;
  return (
    <Frame member={isPaid(viewer.plan)} current="markets" testid="markets-page">
      <Stage first testid="markets-band" labelledBy="markets-h">
        <div className="b-head"><Insight id="markets-h" text={insight} fallback={["Every market", "people bet on."]} size={56} /><p className="b-sub" data-m="lift">Every market people bet on, by the millionaire money in it {when}.</p></div>
        <div className="b-grid">
          {order.map((c, i) => {
            const l = by.get(c.slug);
            return (
              <a key={c.slug} className="b-ccard" href={`/markets/${c.slug}`} data-testid="category-card" data-photo={photos[i]!.src} data-m="settle" style={{ "--d": `${0.4 + i * 0.04}s` } as CSSProperties}>
                <span className="b-ccard__img"><BrandPicture src={photos[i]!.src} fill sizes="(max-width: 552px) 100vw, (max-width: 1160px) 66vw, 760px" priority={i < 4} /></span>
                <span className="b-ccard__txt">
                  <h2 className="b-ccard__name">{c.name}</h2>
                  <span className="b-small b-dim">{l ? (l.millionaire ? `${dollars(l.millionaire)} millionaire money ${when}` : `${dollars(l.pro)} Pro money ${when}`) : c.blurb}</span>
                </span>
              </a>
            );
          })}
        </div>
      </Stage>
    </Frame>
  );
}

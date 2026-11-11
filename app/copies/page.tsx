/* My copies (/copies): keeping score (components/copies/CopyLedger.tsx): totals for this week, this month and all time,
 * every trade tapped to copy with entry, price now, the wallet and whether it's still in, Placed / Skipped. Then the
 * older copy view (components/copies/MyCopies.tsx). Members only. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { MyCopies } from "@/components/copies/MyCopies";
import { ScrollFx } from "@/components/system";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { Lines, Stage } from "@/components/system";
import { CopyLedger } from "@/components/copies/CopyLedger";
import { myCopies } from "@/lib/copies/mine";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My copies", robots: { index: false } };

export default async function CopiesPage() {
  const viewer = await requireMember("/copies");
  const now = Date.now();
  const mine = hasDatabase() ? await myCopies(getDb(), viewer.user!.id, now).catch(() => null) : null;
  return (
    <Frame member current="copies" testid="copies-page">
      <Stage first testid="copies-ledger" labelledBy="cl-h">
        <div className="b-head"><Lines as="h1" id="cl-h" lines={["My copies."]} size={56} /></div>
        {mine ? <CopyLedger list={mine.list} totals={mine.totals} /> : <p className="b-empty">Your copies couldn&apos;t load. Refresh to try again.</p>}
      </Stage>
      <MyCopies db={hasDatabase() ? getDb() : null} viewer={viewer} now={Date.now()} />
      <ScrollFx />
    </Frame>
  );
}

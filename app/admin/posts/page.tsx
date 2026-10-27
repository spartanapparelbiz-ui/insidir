/* /admin/posts: the 10 biggest moves of the last 24 hours as ready-to-post story images (1080×1920) with a caption
 * to copy. Only for the emails in POSTS_ADMIN_EMAILS; everyone else gets the 404. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyCaption } from "@/components/admin/CopyCaption";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { dollars, onWhat } from "@/lib/moves/copy";
import { postCaption, postsAllowed } from "@/lib/moves/posts";
import { listMoves, recordsFor } from "@/lib/moves/store";
import "../../app.css";
import "../../account.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Posts", robots: { index: false, follow: false } };

export default async function PostsPage() {
  const viewer = await getViewer();
  if (!viewer.user || !postsAllowed(viewer.user.email)) notFound();
  const db = hasDatabase() ? getDb() : null;
  const top = db ? await listMoves(db, { since: Date.now() - 86_400_000, byAmount: true, limit: 10 }) : [];
  const records = db ? await recordsFor(db, top.map(m => m.wallet ?? "")) : new Map();
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn />
      <main className="wrap app acct">
        <h1 className="page__h">Posts</h1>
        <p className="asum asum--lead">The 10 biggest moves of the last 24 hours, ready to post.</p>
        {top.length ? (
          <ol className="posts">
            {top.map((m, i) => {
              const src = `/api/share/${encodeURIComponent(m.id)}`;
              return (
                <li key={m.id} className="post" data-post={m.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="post__img" src={src} alt={`${dollars(m.amount)} on ${onWhat(m)}`} width={270} height={480} loading={i < 2 ? "eager" : "lazy"} />
                  <div className="post__body">
                    <p className="post__h">{i + 1}. {dollars(m.amount)} on {onWhat(m)}</p>
                    <a className="btn btn--primary" href={src} download={`insidir-${i + 1}.png`}>Download</a>
                    <CopyCaption id={`cap-${i}`} text={postCaption(m, m.wallet ? records.get(m.wallet) ?? null : null)} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <div className="aempty"><p>No moves in the last 24 hours yet.</p></div>}
      </main>
    </>
  );
}

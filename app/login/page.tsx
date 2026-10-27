/* Log in to Insidir (/login): our own log-in, an email and a 6-digit code (components/auth/LoginForm.tsx). Members
 * only; anyone else is offered "Get Insidir · $39/mo". Already logged in: straight on to where they were going. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { LoginForm } from "@/components/auth/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";
import { safeNext } from "@/lib/auth/login";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect(next);
  return (
    <>
      <SiteHeader signedIn={false} minimal />
      <main className="split dark">
        <div className="split__photo">
          <Photo n={BAND.signin} par eager />
          <p className="split__line serif">Follow the big money.</p>
        </div>
        <div className="split__form">
          <div className="split__box">
            <LoginForm next={next} startHref="/start" initialEmail={sp.email ?? viewer.user?.email ?? ""} />
          </div>
        </div>
      </main>
    </>
  );
}

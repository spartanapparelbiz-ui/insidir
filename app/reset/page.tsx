/* Forgot password? (/reset). No email is sent: the member taps "Confirm it's you", signs in to the payment account
 * that holds their membership, comes back here (lib/auth/reset.ts) and sets a new password. */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { Photo } from "@/components/Photo";
import { NewPassword } from "@/components/auth/NewPassword";
import { SiteHeader } from "@/components/SiteHeader";
import { RESET_COOKIE, resetUser } from "@/lib/auth/reset";
import { getDb, hasDatabase } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

const ERRORS: Record<string, string> = {
  expired: "That took too long. Try again.",
  failed: "We couldn't confirm it's you just now. Try again in a minute.",
  no_account: "We couldn't find an Insidir account for that sign-in. Use the one you paid with, or write to hello@aethric.llc.",
  unavailable: "Password reset isn't available right now. Write to hello@aethric.llc and a person will help.",
};

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const db = hasDatabase() ? getDb() : null;
  const userId = db ? await resetUser(db, jar.get(RESET_COOKIE)?.value).catch(() => null) : null;
  const email = userId && db ? (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email ?? null : null;
  return (
    <>
      <SiteHeader signedIn={false} offer={false} />
      <main className="split dark">
        <div className="split__photo">
          <Photo n={BAND.signin} par eager />
          <p className="split__line serif">Follow the big money.</p>
        </div>
        <div className="split__form">
          <div className="split__box">
            <div className="login">
              <h1 className="login__h">{userId ? "New password" : "Forgot your password?"}</h1>
              {userId ? <NewPassword email={email} /> : (
                <div className="login__form">
                  <p className="login__p">No email needed. Confirm it&apos;s you with the account you paid with, then choose a new password. It takes a few seconds.</p>
                  {sp.error ? <p className="login__err" role="alert">{ERRORS[sp.error] ?? ERRORS.failed}</p> : null}
                  <a className="btn btn--primary btn--big btn--block" href="/reset/confirm" data-reset="confirm">Confirm it&apos;s you</a>
                  <Link className="login__link" href="/login">Back to log in</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/* The old log-in address: now /login. */
import { redirect } from "next/navigation";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  redirect(sp.next ? `/login?next=${encodeURIComponent(sp.next)}` : "/login");
}

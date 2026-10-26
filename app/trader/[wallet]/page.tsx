/* Old trader links (/trader/0x…) go to the profile (/p/0x…). */
import { notFound, permanentRedirect } from "next/navigation";

export default async function TraderRedirect({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const w = wallet.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) notFound();
  permanentRedirect(`/p/${w}`);
}

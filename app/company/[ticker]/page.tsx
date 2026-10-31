/* /company/<TICKER>: the company page lives at /insider-trading/<TICKER> (lib/profiles/name.ts companyHref). */
import { notFound, permanentRedirect } from "next/navigation";
import { companyHref, parseTicker } from "@/lib/profiles/name";

export default async function CompanyAlias({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = parseTicker((await params).ticker);
  if (!ticker) notFound();
  permanentRedirect(companyHref(ticker));
}

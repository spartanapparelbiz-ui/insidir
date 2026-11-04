/* Old /check/<id> links: 301 to the market's page, else the board (lib/legacy/old-links.ts). */
import { oldLinkRedirect } from "@/lib/legacy/old-links";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return oldLinkRedirect("check", (await params).id);
}

/* /terminal is now the feed (docs/V2.md §6). Query strings (e.g. ?welcome=1 after checkout) carry over. */
import { redirect } from "next/navigation";

export default async function TerminalRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : v ? [[k, v]] : [])) as Array<[string, string]>).toString();
  redirect(`/feed${q ? `?${q}` : ""}`);
}

import type { Metadata } from "next";
import { TargetPage, targetMetadata } from "@/components/TargetPage";
import { notFound } from "next/navigation";
import { slugParam, type Target } from "@/lib/link";

export const dynamic = "force-dynamic";
const need = (s: string | null): string => s ?? notFound();
type Props = { params: Promise<{ slug: string; market: string }> };
const target = async ({ params }: Props): Promise<Target> => {
  const p = await params;
  return { kind: "event", slug: need(slugParam(p.slug)), market: need(slugParam(p.market)) };
};

export async function generateMetadata(props: Props): Promise<Metadata> { return targetMetadata(await target(props)); }
export default async function EventMarketPage(props: Props) { return <TargetPage target={await target(props)} />; }

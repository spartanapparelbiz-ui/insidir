import type { Metadata } from "next";
import { TargetPage, targetMetadata } from "@/components/TargetPage";
import { notFound } from "next/navigation";
import { slugParam, type Target } from "@/lib/link";

export const dynamic = "force-dynamic";
const need = (s: string | null): string => s ?? notFound();
type Props = { params: Promise<{ slug: string }> };
const target = async ({ params }: Props): Promise<Target> => ({ kind: "event", slug: need(slugParam((await params).slug)), market: null });

export async function generateMetadata(props: Props): Promise<Metadata> { return targetMetadata(await target(props)); }
export default async function EventPage(props: Props) { return <TargetPage target={await target(props)} />; }

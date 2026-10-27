/* The share card with example data (gallery only): /dev/share?format=og|story. */
import { notFound } from "next/navigation";
import { SHARE } from "@/lib/dev-fixtures";
import { shareCardImage, type ShareFormat } from "@/lib/share-card";
import { galleryOn } from "../gallery";

export async function GET(req: Request) {
  if (!galleryOn()) notFound();
  const format: ShareFormat = new URL(req.url).searchParams.get("format") === "story" ? "story" : "og";
  return shareCardImage(SHARE, format);
}

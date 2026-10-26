/* The Whop marketplace listing for both products: headline, description and a gallery uploaded from qa/screenshots,
 * then (with --submit) products.publish, which sends the product to Whop's review (docs: api-reference/beta/products/publish-product).
 *
 *   npx tsx scripts/whop-growth.ts                    dry run: prints what would change, touches nothing
 *   npx tsx scripts/whop-growth.ts --apply            uploads the gallery and updates the listing copy
 *   npx tsx scripts/whop-growth.ts --apply --submit   …and submits both products for marketplace review
 *
 * Runs against the environment WHOP_ENV picks; production also needs WHOP_GROWTH_ALLOW_PRODUCTION=1, set by the owner.
 * Publishing also requires a logo on Whop, set in the dashboard. Affiliate rates (global 30%, members 50%) are not
 * in the product update API, so they are set in the dashboard: docs/WHOP-LAUNCH.md. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WhopError } from "@whop/sdk";
import { whop } from "@/lib/whop/client";
import { whopConfig } from "@/lib/whop/config";

export const LISTING = {
  headline: "Live price gaps on Polymarket and Kalshi, found by math",
  description: [
    "Insidir scans Kalshi, Polymarket and Polymarket US every few seconds for sets of positions that pay $1 in every outcome for less than $1 after fees, and for prices that disagree across venues.",
    "Every deal shows the exact play, what each leg costs, every fee and the profit after fees, plus a green, yellow or red safety light for how closely the two markets' rules match. A deal locks in a profit if both sides fill and both markets settle the same way.",
    "Insidir ($39/mo): the live Terminal, every deal with sizes, and push alerts within 60 seconds. Insidir Pro ($99/mo): everything in Insidir, plus instant alerts, large Polymarket trades as they happen, your P&L and the full receipts history. Every deal is logged at detection with how it settled.",
    "Information only, not financial advice. Not affiliated with Polymarket or Kalshi. Prices move and fills aren't guaranteed. Check that prediction markets are available to you. Cancel anytime in one click.",
  ].join("\n\n"),
  /** In display order. These are the e2e screenshots: check they show what buyers will see before submitting. */
  gallery: ["terminal-pro-1440.png", "deal-pro-1440.png", "landing-1440.png", "receipts-1440.png", "whales-1440.png", "terminal-pro-390.png"],
};

async function upload(file: string): Promise<string> {
  const bytes = await readFile(join(__dirname, "..", "qa", "screenshots", file));
  const f = await whop().files.create({ filename: file, byte_size: bytes.length, visibility: "public" });
  if (!f.upload_url) throw new Error(`no upload_url for ${file}`);
  const res = await fetch(f.upload_url, { method: "PUT", headers: (f.upload_headers ?? {}) as Record<string, string>, body: bytes });
  if (!res.ok) throw new Error(`upload ${file}: HTTP ${res.status}`);
  return f.id;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply"), submit = process.argv.includes("--submit");
  const c = whopConfig();
  if (apply && c.env === "production" && process.env.WHOP_GROWTH_ALLOW_PRODUCTION !== "1") {
    throw new Error("This changes the live Whop listing. The owner must set WHOP_GROWTH_ALLOW_PRODUCTION=1.");
  }
  if (LISTING.headline.length > 80 || LISTING.description.length > 1500) throw new Error("headline ≤ 80 and description ≤ 1,500 characters (Whop's limits)");
  const products = [c.products.insidir, c.products.pro].filter(Boolean);
  if (!products.length) throw new Error(`Set the ${c.env} product ids first (scripts/whop-setup.ts).`);
  console.log(`Whop ${c.env}${apply ? "" : " (dry run)"}: products ${products.join(", ")}`);
  console.log(`  headline: ${LISTING.headline}\n  description: ${LISTING.description.length} characters\n  gallery: ${LISTING.gallery.join(", ")}`);
  if (!apply) { console.log("\nNothing changed. Add --apply (and --submit to send it for review)."); return; }
  const ids = [];
  for (const f of LISTING.gallery) ids.push(await upload(f));
  for (const id of products) {
    await whop().products.update({ id, headline: LISTING.headline, description: LISTING.description, gallery_images: ids.map(x => ({ id: x })) });
    console.log(`${id}: listing updated`);
    if (submit) {
      const p = await whop().products.publish({ id });
      console.log(`${id}: submitted for review (${JSON.stringify((p as unknown as Record<string, unknown>).status ?? "pending_review")})`);
    }
  }
}

main().catch(e => {
  console.error(e instanceof WhopError ? `Whop ${e.statusCode ?? ""}: ${e.message} ${JSON.stringify(e.body ?? "")}` : e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

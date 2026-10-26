/* Creates the two Whop products and their monthly plans, and prints the env lines to save.
 *
 *   Insidir      prod_…  + plan_… $39 every 30 days
 *   Insidir Pro  prod_…  + plan_… $99 every 30 days   (Pro members get everything Insidir has: lib/plans.ts)
 *   Free is no product at all: the delayed feed only.
 *
 * Runs against the environment WHOP_ENV picks (lib/whop/config.ts), the sandbox by default:
 *
 *   WHOP_SANDBOX_API_KEY=… WHOP_SANDBOX_COMPANY_ID=biz_… npx tsx scripts/whop-setup.ts
 *
 * Production creates real, sellable products, so it also needs WHOP_SETUP_ALLOW_PRODUCTION=1, set by the owner.
 * Re-running is safe: a product whose route already exists is reused, and so is a matching plan. */
import { WhopError } from "@whop/sdk";
import { whop } from "@/lib/whop/client";
import { appUrl, whopConfig } from "@/lib/whop/config";

const PRODUCTS = [
  { key: "INSIDIR", title: "Insidir", route: "insidir", price: 39,
    headline: "Live Polymarket and Kalshi price gaps, found by math",
    description: "The live Insidir Terminal: every deal the scanner finds on Kalshi, Polymarket and Polymarket US the moment it appears, with sizes, fees and profit after fees, plus push alerts within 60 seconds. Information only, not financial advice." },
  { key: "PRO", title: "Insidir Pro", route: "insidir-pro", price: 99,
    headline: "Everything in Insidir, plus instant alerts, whales and P&L",
    description: "Everything in Insidir, plus instant push alerts, large Polymarket trades as they happen, your Kalshi and Polymarket P&L and the full receipts history. Information only, not financial advice." },
] as const;

async function main(): Promise<void> {
  const c = whopConfig();
  if (c.env === "production" && process.env.WHOP_SETUP_ALLOW_PRODUCTION !== "1") {
    throw new Error("WHOP_ENV=production creates real products. The owner must set WHOP_SETUP_ALLOW_PRODUCTION=1 to do that.");
  }
  if (!c.apiKey || !c.companyId) throw new Error(`Set the ${c.env} API key and company id first (see lib/whop/config.ts).`);
  const client = whop();
  const prefix = c.env === "production" ? "WHOP_" : "WHOP_SANDBOX_";
  console.log(`Whop ${c.env}: ${c.hosts.api}\n`);
  const lines: string[] = [];
  const existing = [];
  for await (const p of await client.products.list({ account_id: c.companyId, first: 100 })) existing.push(p);
  for (const def of PRODUCTS) {
    let product = existing.find(p => p.route === def.route);
    if (product) console.log(`${def.title}: product ${product.id} already exists`);
    else {
      product = await client.products.create({
        account_id: c.companyId, title: def.title, route: def.route, headline: def.headline, description: def.description,
        visibility: "hidden", redirect_purchase_url: `${appUrl()}/terminal?welcome=1`,
      });
      console.log(`${def.title}: created product ${product.id}`);
    }
    const variants = [];
    for await (const v of await client.variants.list({ product_ids: [product.id], first: 50 })) variants.push(v);
    let variant = variants.find(v => v.plan_type === "renewal" && v.billing_period === 30 && Number(v.renewal_price) === def.price);
    if (variant) console.log(`${def.title}: plan ${variant.id} ($${def.price}/30 days) already exists`);
    else {
      variant = await client.variants.create({
        account_id: c.companyId, product_id: product.id, title: `${def.title} monthly`, plan_type: "renewal", release_method: "buy_now",
        currency: "usd", initial_price: def.price, renewal_price: def.price, billing_period: 30, visibility: "visible",
      });
      console.log(`${def.title}: created plan ${variant.id} ($${def.price} every 30 days)`);
    }
    lines.push(`${prefix}PRODUCT_${def.key}=${product.id}`, `${prefix}PLAN_${def.key}=${variant.id}`);
  }
  console.log(`\nSave these as Railway variables on the web and worker services:\n\n${lines.join("\n")}`);
  console.log("\nThe products are created hidden; publishing them to the Whop marketplace is a separate, owner-approved step (scripts/whop-growth.ts).");
}

main().catch(e => {
  console.error(e instanceof WhopError ? `Whop ${e.statusCode ?? ""}: ${e.message} ${JSON.stringify(e.body ?? "")}` : e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

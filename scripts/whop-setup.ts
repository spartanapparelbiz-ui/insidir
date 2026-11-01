/* npm run whop:setup: finds or makes the Whop plan, webhook and login app (lib/billing/setup.ts). Runs in Railway's
 * pre-deploy step after the migrations. One failure stops the deploy: a login app with neither /login/callback nor
 * /reset/callback registered (sign-in would fail for everyone). Anything else is logged and the site keeps checkout
 * closed until it's fixed. */
import { closeDb, getDb, hasDatabase } from "@/lib/db";
import { runWhopSetup } from "@/lib/billing/setup";

async function main() {
  if (!hasDatabase()) { console.log("Whop setup: skipped (no DATABASE_URL)"); return; }
  if (!process.env.WHOP_API_KEY) { console.log("Whop setup: skipped (no WHOP_API_KEY)"); return; }
  const r = await runWhopSetup({ db: getDb(), env: process.env, fetch, log: line => console.log(line) });
  if (r.app === "missing redirect") {
    console.error("Whop setup: FAILED. Sign-in can't work: the Whop login app has no redirect URI we serve (see above). Deploy stopped.");
    process.exitCode = 1;
  }
}

main().catch(e => console.log(`Whop setup: failed (${e instanceof Error ? e.message : String(e)})`)).finally(() => closeDb().catch(() => undefined));

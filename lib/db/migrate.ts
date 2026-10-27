/* Applies the generated migrations in drizzle/ (npm run db:migrate). Runs before the web starts on Railway (railway.json
 * preDeployCommand) and at the start of every worker run (npm run worker), so either service brings the schema up to date. */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index";

async function main(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });

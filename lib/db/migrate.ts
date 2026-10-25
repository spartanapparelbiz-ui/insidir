/* Applies the generated migrations in drizzle/ (npm run db:migrate). Runs before the web and worker start on Railway. */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index";

async function main(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });

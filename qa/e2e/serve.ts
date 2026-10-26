/* Serves the e2e build by hand (for screenshots and manual checks): the same seed, mocks and keeper as the test run
 * (global-setup), then `next start` in E2E_APP_DIR. Ctrl-C stops everything. */
import { spawn } from "node:child_process";
import { APP_PORT, SERVER_ENV } from "./env";
import globalSetup from "./global-setup";

const appDir = process.env.E2E_APP_DIR;
if (!appDir) throw new Error("Set E2E_APP_DIR to the built copy (see run.sh).");
void (async () => {
const teardown = await globalSetup();
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: appDir, stdio: "inherit", env: { ...process.env, ...SERVER_ENV } });
const stop = async () => { app.kill(); await teardown(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
})();

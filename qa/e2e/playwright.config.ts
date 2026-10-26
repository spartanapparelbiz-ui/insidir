/* End-to-end tests at phone (390×844) and desktop (1440×900) sizes, against a production build in E2E_APP_DIR
 * (a copy of the repo built by qa/e2e/run.sh, so the shared .next folder is never touched) with a mock Whop,
 * a mock push service and the seeded e2e database. */
import { defineConfig } from "@playwright/test";
import { APP_PORT, APP_URL, SERVER_ENV } from "./env";

const appDir = process.env.E2E_APP_DIR ?? process.cwd();

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"], ["json", { outputFile: ".out/results.json" }]],
  use: {
    baseURL: APP_URL, trace: "retain-on-failure",
    // Use the sandbox's preinstalled Chromium when the pinned @playwright/test expects another build.
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  outputDir: ".out/artifacts",
  projects: [
    { name: "phone-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${APP_PORT}`,
    cwd: appDir,
    url: `${APP_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: SERVER_ENV,
  },
});

/* Entry point of the match thread: registers tsx (TypeScript and the @/ path alias) inside the thread, then loads it. */
const { workerData } = require("node:worker_threads");
require("tsx/cjs/api").register();
require(workerData.entry);

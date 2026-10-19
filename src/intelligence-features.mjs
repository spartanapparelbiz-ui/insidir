/* Insidir Intelligence: bounded, source-linked research, no trade execution.
 * Shared event ingestion is handled by intelligence-monitor.mjs and form13f.mjs; these views query indexed
 * facts rather than invoking a model per page view. Kept as the single import point for the three features. */
export { intelligenceBriefing, savePreferences, buildStories, rankStory, RANKING_RULES, FREQUENCIES } from "./intelligence-briefing.mjs";
export { investigate, synthesize, parseQuestion, companyDirectory } from "./intelligence-investigate.mjs";
export { listManagers, managerDetail, simulate, simulateAllocation } from "./intelligence-mirror.mjs";

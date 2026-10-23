/* Answers for the rebuilt app pages (ui.css: Today, the ticker page, Alerts) in the browser gates, from
   scripts/fixtures/ui-api.json (fictional demo companies and people). uiAnswer(pathname, method) returns the JSON body,
   or null when the request is not one of theirs. */
import { readFileSync } from "node:fs";
export const UI = JSON.parse(readFileSync(new URL("./ui-api.json", import.meta.url), "utf8"));
export function uiAnswer(p, method = "GET") {
  if (method !== "GET") return { ok: true };
  if (p === "/v1/me") return UI.me;
  if (p === "/v1/me/today") return UI.today;
  if (p === "/v1/feed") return UI.feed;
  if (p === "/v1/chart") return UI.chart;
  if (/^\/v1\/ticker\/[^/]+\/insiders$/.test(p)) return UI.insiders;
  if (/^\/v1\/ticker\/[^/]+\/funds$/.test(p)) return UI.funds;
  if (p === "/v1/filings") return UI.filings;
  if (p === "/v1/me/notifications") return UI.notifications;
  if (p === "/v1/me/watchlist") return UI.watchlist;
  if (p === "/v1/me/people/updates") return UI.people;
  if (p === "/v1/me/research-decisions") return UI.decisions;
  if (p === "/v1/status") return UI.status;
  if (p === "/v1/me/email-preferences") return UI.emailPreferences;
  if (p === "/v1/me/intelligence/preferences") return UI.briefingPreferences;
  if (p === "/v1/me/push") return UI.push;
  if (/^\/v1\/(company\/(news|profile)|entities\/)/.test(p)) return { items: [] };
  return null;
}

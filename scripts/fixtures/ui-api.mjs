/* Answers for the rebuilt app pages (ui.css: Today, the ticker page, Alerts) in the browser gates, from
   scripts/fixtures/ui-api.json (fictional demo companies and people). uiAnswer(pathname, method) returns the JSON body,
   or null when the request is not one of theirs. */
import { readFileSync } from "node:fs";
import { readOwnershipDocument } from "../../src/filing-document.mjs";
export const UI = JSON.parse(readFileSync(new URL("./ui-api.json", import.meta.url), "utf8"));
// One SYNTHETIC Form 4 (fictional issuer and people) for the in-app filing view (filing.html).
const FORM4 = readFileSync(new URL("./form4.xml", import.meta.url), "utf8");
const FILING = { accession: "000000004226000015", filer_cik: "0000000042", issuer_cik: "0000000099", issuer_name: "EXAMPLE CORP", ticker: "EXMP", form_type: "4", is_amendment: false,
  published_at: "2026-10-23T20:23:07.881Z", source_url: "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/form4.xml" };
const LINES = [
  { owner_cik: "0000000042", owner_name: "DOE JANE", transaction_code: "S", acquired_disposed: "D", derivative: false, security_title: "Common Stock", shares: 12000, price_per_share: 78.6025, estimated_value: 943230, transaction_date: "2026-10-21" },
  { owner_cik: "0000000042", owner_name: "DOE JANE", transaction_code: "M", acquired_disposed: "D", derivative: true, security_title: "Stock Option (right to buy)", shares: 1500, price_per_share: 0, estimated_value: null, transaction_date: "2026-10-20" }];
export function uiAnswer(p, method = "GET") {
  if (method !== "GET") return { ok: true };
  if (p === "/v1/me") return UI.me;
  if (p === "/v1/me/today") return UI.today;
  if (p === "/v1/feed") return UI.feed;
  if (p === "/v1/chart") return UI.chart;
  if (/^\/v1\/ticker\/[^/]+\/insiders$/.test(p)) return UI.insiders;
  if (/^\/v1\/ticker\/[^/]+\/funds$/.test(p)) return UI.funds;
  if (p === "/v1/filings") return UI.filings;
  if (/^\/v1\/filings\/\d{18}\/document$/.test(p)) return { filing: { accession: FILING.accession, form: "4", ticker: "EXMP", issuerName: FILING.issuer_name, issuerCik: FILING.issuer_cik, publishedAt: FILING.published_at, isAmendment: false },
    document: readOwnershipDocument(FORM4), sourceUrl: FILING.source_url, indexUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000015/", retrievedAt: FILING.published_at };
  if (/^\/v1\/filings\/\d{18}$/.test(p)) return { filing: FILING, transactions: LINES };
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

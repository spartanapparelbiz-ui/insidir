/* Intelligence Briefing: a member's personalized view of shared, already-indexed public records.
 *
 * Built only from stored SEC data (sec_filings / sec_transactions / sec_filing_owners from Form 4 ingestion,
 * research_events from the 8-K/6-K monitor), matched against the member's watchlist and followed people.
 * No model call is made per member: stories are assembled with SQL and code, and an optional AI summary of
 * a filing is the shared, cached one from /v1/ai/explain.
 *
 * Related records are grouped into one story: every Form 4 at one company disclosed on the same day is one
 * story, and every 8-K/6-K notice from one company on one day is one story. Ordering follows published,
 * transparent rules (rankStory) and each story carries the reasons; there is no investment score. */
import { query as queryDb } from "./db.mjs";
import { iso, day, cikForms, bareCik, displayName, companyName, roleOf, money, count, codeLabel, eightKLabel, secSource, summarizeLines } from "./intelligence-common.mjs";

export const FREQUENCIES = Object.freeze(["immediate", "daily", "weekly"]);
const MAX_TICKERS = 200, MAX_PEOPLE = 150, MAX_FILINGS = 160, MAX_LINES = 2000, MAX_NOTICES = 120;

export const SUBJECTS_SQL = `SELECT
  COALESCE((SELECT array_agg(w.ticker ORDER BY w.ticker) FROM (SELECT ticker FROM watchlist WHERE user_id=$1 ORDER BY created_at DESC LIMIT ${MAX_TICKERS}) w),'{}') AS tickers,
  COALESCE((SELECT array_agg(p.owner_cik) FROM (SELECT owner_cik FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT ${MAX_PEOPLE}) p),'{}') AS people,
  ip.frequency,ip.last_visit_at,ip.previous_visit_at,ip.last_digest_at
  FROM (SELECT 1) one LEFT JOIN intelligence_preferences ip ON ip.user_id=$1`;

/* Filings in the window that match a watchlist ticker, a followed person's own lines, or a joint filing
 * listing a followed person. Every branch uses an index (ticker, owner_cik, owner_cik on owners). */
export const FORM4_SQL = `WITH matched AS (
    SELECT f.accession FROM sec_filings f WHERE f.ticker=ANY($1::text[]) AND f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$3)
    UNION SELECT t.accession FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.owner_cik=ANY($2::text[]) AND f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$3)
    UNION SELECT o.accession FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
      WHERE o.owner_cik=ANY($2::text[]) AND f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$3)),
  picked AS (SELECT f.* FROM sec_filings f JOIN matched m ON m.accession=f.accession ORDER BY f.published_at DESC NULLS LAST LIMIT ${MAX_FILINGS})
  SELECT f.accession,f.ticker,f.issuer_cik,f.issuer_name,f.form_type,f.is_amendment,f.published_at,f.retrieved_at,f.source_url,
    t.id AS line_id,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,t.shares,t.price_per_share,t.estimated_value,t.security_title
  FROM picked f LEFT JOIN sec_transactions t ON t.accession=f.accession
  ORDER BY f.published_at DESC NULLS LAST,f.accession,t.id LIMIT ${MAX_LINES}`;
export const OWNERS_SQL = `SELECT accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner
  FROM sec_filing_owners WHERE accession=ANY($1::text[]) ORDER BY accession,owner_cik`;
export const NOTICES_SQL = `SELECT event_key,title,subject,source_url,published_at,observed_at,metadata FROM research_events
  WHERE verified=true AND source_type='sec_notice' AND subject=ANY($1::text[]) AND observed_at>=now()-make_interval(days=>$2)
  ORDER BY observed_at DESC LIMIT ${MAX_NOTICES}`;
export const DELIVERY_SQL = `SELECT
  (SELECT count(*) FROM push_subscriptions WHERE user_id=$1)::integer AS devices,
  count(*) FILTER (WHERE d.status='sent' AND d.sent_at>now()-interval '7 days')::integer AS sent_7d,
  count(*) FILTER (WHERE d.status='failed' AND d.last_attempt_at>now()-interval '7 days')::integer AS failed_7d,
  count(*) FILTER (WHERE d.status='pending')::integer AS pending,
  max(d.sent_at) AS last_sent_at
  FROM push_subscriptions s LEFT JOIN push_deliveries d ON d.subscription_id=s.id WHERE s.user_id=$1`;
export const VISIT_SQL = `INSERT INTO intelligence_preferences(user_id,last_visit_at) VALUES($1,now())
  ON CONFLICT(user_id) DO UPDATE SET
    previous_visit_at=CASE WHEN intelligence_preferences.last_visit_at IS NULL OR intelligence_preferences.last_visit_at<now()-interval '30 minutes'
      THEN intelligence_preferences.last_visit_at ELSE intelligence_preferences.previous_visit_at END,
    last_visit_at=now()`;

/* Ordering rules, published to the member with every story. Points only order the list; they never say
 * anything about a security. */
export const RANKING_RULES = Object.freeze([
  { rule: "followed_person", points: 3, label: "Involves a person you follow" },
  { rule: "watchlist", points: 2, label: "Company is on your watchlist" },
  { rule: "disclosed_24h", points: 2, label: "Disclosed in the last 24 hours" },
  { rule: "disclosed_72h", points: 1, label: "Disclosed in the last 3 days" },
  { rule: "open_market", points: 1, label: "Includes an open-market purchase or sale (code P or S)" },
  { rule: "company_report", points: 1, label: "Company current report (8-K or 6-K)" },
  { rule: "amendment_only", points: -1, label: "Only amendments to earlier reports" }
]);
export function rankStory(story, now = Date.now()) {
  const reasons = [];
  const add = rule => reasons.push(RANKING_RULES.find(r => r.rule === rule));
  if (story.why.some(w => w.kind === "followed_person")) add("followed_person");
  if (story.why.some(w => w.kind === "watchlist")) add("watchlist");
  const age = now - Date.parse(story.disclosedAt || 0);
  if (age <= 86400_000) add("disclosed_24h"); else if (age <= 3 * 86400_000) add("disclosed_72h");
  if (story.kind === "insider_filings" && (story.stats.purchases || story.stats.sales)) add("open_market");
  if (story.kind === "company_report") add("company_report");
  if (story.amendmentOnly) add("amendment_only");
  return { score: reasons.reduce((s, r) => s + r.points, 0), reasons: reasons.map(r => r.label) };
}

function insiderHeadline(company, people, s) {
  const who = people.length === 1 ? people[0].name : count(people.length, "insider");
  const parts = [];
  if (s.sales) parts.push(count(s.sales, "sale"));
  if (s.purchases) parts.push(count(s.purchases, "purchase"));
  if (!parts.length) parts.push(count(s.other, "other reported change"));
  else if (s.other) parts.push(count(s.other, "other change"));
  return who + " at " + company + " reported " + parts.join(", ").replace(/, ([^,]*)$/, " and $1");
}

/* Pure: rows -> grouped stories. Exported for tests. */
export function buildStories({ lines = [], owners = [], notices = [], tickers = [], peopleCiks = [], since = null, now = Date.now() }) {
  const watch = new Set(tickers), follow = new Set(peopleCiks.map(bareCik));
  const ownersBy = new Map();
  for (const o of owners) { if (!ownersBy.has(o.accession)) ownersBy.set(o.accession, []); ownersBy.get(o.accession).push(o); }
  const groups = new Map();
  for (const r of lines) {
    const k = "f4:" + (r.ticker || r.issuer_cik || r.accession) + ":" + day(r.published_at);
    if (!groups.has(k)) groups.set(k, { key: k, filings: new Map(), lines: [] });
    const g = groups.get(k);
    if (!g.filings.has(r.accession)) g.filings.set(r.accession, r);
    if (r.line_id) g.lines.push(r);
  }
  const stories = [];
  for (const g of groups.values()) {
    const filings = [...g.filings.values()], first = filings[0];
    const ticker = first.ticker || null, company = companyName(first.issuer_name, ticker);
    const people = new Map();
    for (const f of filings) {
      const listed = ownersBy.get(f.accession) || [];
      for (const o of listed) people.set(bareCik(o.owner_cik), { cik: bareCik(o.owner_cik).padStart(10, "0"), name: displayName(o.owner_name), role: roleOf(o) });
      if (!listed.length) for (const l of g.lines.filter(l => l.accession === f.accession)) {
        const c = bareCik(l.owner_cik);
        if (c && !people.has(c)) people.set(c, { cik: c.padStart(10, "0"), name: displayName(l.owner_name), role: null });
      }
    }
    const peopleList = [...people.values()];
    const stats = summarizeLines(g.lines);
    const why = [];
    if (ticker && watch.has(ticker)) why.push({ kind: "watchlist", text: ticker + " is on your watchlist" });
    for (const p of peopleList) if (follow.has(bareCik(p.cik))) why.push({ kind: "followed_person", text: "You follow " + p.name });
    const txDates = g.lines.map(l => day(l.transaction_date)).filter(Boolean).sort();
    const disclosedAt = filings.map(f => iso(f.published_at)).filter(Boolean).sort().at(-1) || null;
    const retrievedAt = filings.map(f => iso(f.retrieved_at)).filter(Boolean).sort().at(-1) || null;
    const facts = [];
    if (stats.sales) facts.push(count(stats.sales, "reported sale") + (stats.saleValue ? " totalling " + money(stats.saleValue) : "") + (stats.saleShares ? " (" + Math.round(stats.saleShares).toLocaleString("en-US") + " shares)" : ""));
    if (stats.purchases) facts.push(count(stats.purchases, "reported purchase") + (stats.purchaseValue ? " totalling " + money(stats.purchaseValue) : "") + (stats.purchaseShares ? " (" + Math.round(stats.purchaseShares).toLocaleString("en-US") + " shares)" : ""));
    const otherCodes = [...new Set(g.lines.filter(l => l.category === "other").map(l => String(l.transaction_code || "").toUpperCase()).filter(Boolean))];
    if (stats.other) facts.push(count(stats.other, "other reported change") + (otherCodes.length ? ": " + otherCodes.slice(0, 4).map(c => codeLabel(c) + " (" + c + ")").join(", ") : ""));
    if (stats.valuesMissing) facts.push(count(stats.valuesMissing, "purchase or sale line", "purchase or sale lines") + " did not report a price, so no value is shown for them");
    if (stats.duplicatesCollapsed) facts.push(count(stats.duplicatesCollapsed, "line") + " repeated by an amendment counted once");
    const amendmentOnly = filings.every(f => f.is_amendment);
    const story = {
      id: g.key, kind: "insider_filings", ticker, company, issuerCik: first.issuer_cik || null,
      headline: insiderHeadline(company, peopleList, stats) + (amendmentOnly ? " (amended reports)" : ""),
      people: peopleList.slice(0, 12), peopleCount: peopleList.length, stats, facts,
      eventDate: txDates.length ? { from: txDates[0], to: txDates.at(-1) } : null,
      disclosedAt, retrievedAt, amendmentOnly, why,
      sources: filings.slice(0, 12).map(f => ({ label: "SEC Form " + f.form_type + (f.is_amendment ? " (amendment)" : ""), url: secSource(f.source_url), accession: f.accession,
        filedAt: iso(f.published_at), people: (ownersBy.get(f.accession) || []).map(o => displayName(o.owner_name)).slice(0, 4) })).filter(s => s.url),
      filingsCount: filings.length
    };
    stories.push(story);
  }
  const noticeGroups = new Map();
  for (const n of notices) {
    const k = "8k:" + n.subject + ":" + day(n.published_at || n.observed_at);
    if (!noticeGroups.has(k)) noticeGroups.set(k, []);
    noticeGroups.get(k).push(n);
  }
  for (const [k, list] of noticeGroups) {
    const n0 = list[0], ticker = n0.subject, meta = n0.metadata || {};
    const company = companyName(meta.issuerName, ticker);
    const forms = [...new Set(list.map(n => n.metadata?.form).filter(Boolean))];
    const items = [...new Set(list.flatMap(n => n.metadata?.items || []))];
    const reportDates = list.map(n => n.metadata?.reportDate).filter(Boolean).sort();
    const itemText = eightKLabel(items);
    stories.push({
      id: k, kind: "company_report", ticker, company, issuerCik: meta.cik || null,
      headline: (company === ticker ? ticker : company) + " filed " + (list.length === 1 ? "a current report" : count(list.length, "current report")) + " (" + forms.join(", ") + ")",
      people: [], peopleCount: 0, stats: { notices: list.length },
      facts: [itemText ? "Reported items: " + itemText : "The SEC index entry does not list the reported items; open the filing for its contents."],
      eventDate: reportDates.length ? { from: reportDates[0], to: reportDates.at(-1) } : null,
      disclosedAt: list.map(n => iso(n.published_at)).filter(Boolean).sort().at(-1) || null,
      retrievedAt: list.map(n => iso(n.observed_at)).filter(Boolean).sort().at(-1) || null,
      amendmentOnly: forms.every(f => /\/A$/.test(f)),
      why: [{ kind: "watchlist", text: ticker + " is on your watchlist" }],
      sources: list.slice(0, 8).map(n => ({ label: "SEC Form " + (n.metadata?.form || "8-K"), url: secSource(n.source_url), accession: n.metadata?.accession || null, filedAt: iso(n.published_at) })).filter(s => s.url),
      filingsCount: list.length
    });
  }
  const sinceMs = since ? Date.parse(since) : null;
  for (const s of stories) {
    s.ranking = rankStory(s, now);
    s.isNew = sinceMs != null && Math.max(Date.parse(s.retrievedAt || 0), Date.parse(s.disclosedAt || 0)) > sinceMs;
  }
  const byCompany = new Map();
  for (const s of stories) if (s.ticker) { if (!byCompany.has(s.ticker)) byCompany.set(s.ticker, []); byCompany.get(s.ticker).push(s.id); }
  for (const s of stories) s.related = s.ticker ? byCompany.get(s.ticker).filter(id => id !== s.id).slice(0, 5) : [];
  stories.sort((a, b) => b.ranking.score - a.ranking.score || String(b.disclosedAt).localeCompare(String(a.disclosedAt)) || a.id.localeCompare(b.id));
  return stories;
}

/* Watchlist + follows -> briefing. Updates the visit marker (for "new since your last visit"). */
export async function intelligenceBriefing(userId, { run = queryDb, days = 7, now = Date.now(), pushConfigured = false, trackVisit = true } = {}) {
  const window = Math.min(30, Math.max(1, Math.trunc(Number(days)) || 7));
  const subj = (await run(SUBJECTS_SQL, [userId])).rows[0] || {};
  const tickers = subj.tickers || [], people = subj.people || [];
  const lastVisit = iso(subj.last_visit_at), previous = iso(subj.previous_visit_at);
  // "New" means newer than the visit before this one; a reload within 30 minutes keeps the same baseline.
  const since = lastVisit && now - Date.parse(lastVisit) > 30 * 60_000 ? lastVisit : previous;
  if (trackVisit) await run(VISIT_SQL, [userId]);
  const delivery = (await run(DELIVERY_SQL, [userId])).rows[0] || {};
  const base = {
    generatedAt: new Date(now).toISOString(), windowDays: window, since,
    subjects: { tickers: tickers.length, people: people.length },
    preferences: { frequency: FREQUENCIES.includes(subj.frequency) ? subj.frequency : "immediate", lastDigestAt: iso(subj.last_digest_at) },
    delivery: { pushConfigured, devices: delivery.devices || 0, sent7d: delivery.sent_7d || 0, failed7d: delivery.failed_7d || 0, pending: delivery.pending || 0, lastSentAt: iso(delivery.last_sent_at) },
    rankingRules: RANKING_RULES, generatedBy: "shared_sec_index", advice: false, executed: false
  };
  const notes = [
    "Covers SEC Form 4 ownership reports and 8-K/6-K company current reports indexed by Insidir. Other filing types (10-K, 10-Q, proxy statements) are not part of the briefing.",
    "Public disclosures can arrive days after the underlying event. A quiet company here does not prove nothing happened."
  ];
  if (!tickers.length && !people.length) return { ...base, stories: [], needsSetup: true, coverage: { quiet: [], quietCount: 0, notes } };
  const ciks = cikForms(people);
  const [form4, notices] = await Promise.all([
    run(FORM4_SQL, [tickers, ciks, window]),
    tickers.length ? run(NOTICES_SQL, [tickers, window]) : Promise.resolve({ rows: [] })
  ]);
  const accessions = [...new Set(form4.rows.map(r => r.accession))];
  const owners = accessions.length ? (await run(OWNERS_SQL, [accessions])).rows : [];
  const stories = buildStories({ lines: form4.rows, owners, notices: notices.rows, tickers, peopleCiks: people, since, now });
  const active = new Set(stories.map(s => s.ticker).filter(Boolean));
  const quiet = tickers.filter(t => !active.has(t));
  if (form4.rows.length >= MAX_LINES) notes.push("This window has more records than one briefing shows; the most recent are listed.");
  return { ...base, stories, needsSetup: false, coverage: { quiet: quiet.slice(0, 40), quietCount: quiet.length, notes } };
}

export async function savePreferences(userId, raw, run = queryDb) {
  const frequency = String(raw?.frequency || "");
  if (!FREQUENCIES.includes(frequency)) throw Object.assign(new Error("frequency must be immediate, daily or weekly"), { status: 400 });
  // A digest period starts when the member chooses it, so records from before the switch are never replayed.
  const r = await run(`INSERT INTO intelligence_preferences(user_id,frequency,last_digest_at) VALUES($1,$2,now())
    ON CONFLICT(user_id) DO UPDATE SET frequency=EXCLUDED.frequency,updated_at=now(),
      last_digest_at=CASE WHEN intelligence_preferences.frequency=EXCLUDED.frequency THEN intelligence_preferences.last_digest_at ELSE now() END
    RETURNING frequency,updated_at`, [userId, frequency]);
  return { frequency: r.rows[0].frequency, updatedAt: iso(r.rows[0].updated_at) };
}

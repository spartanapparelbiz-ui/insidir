/* Insidir Terminal's tables, in their own PostgreSQL schema ("terminal") so they never collide with the old
 * stock product's tables in the same Railway database (those are left untouched). Drizzle ORM. */
import type { NearMiss } from "@/lib/engines/near-miss";
import { boolean, doublePrecision, index, integer, jsonb, pgSchema, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { MarketPair, Opportunity, Plan, Region, Safety, Venue, VMarket, WhaleTrade } from "@/lib/types";

export const terminal = pgSchema("terminal");

/** User settings. No bankroll: size filters are plain numbers the user sets. */
export interface UserSettings {
  /** Hide plays under this ROI, as a fraction (0.01 = 1%). */
  minRoi: number;
  /** Hide plays whose fillable cost is under this many dollars. */
  minSizeUsd: number;
  /** Empty = every category. */
  categories: string[];
  /** Venues the user can use; always intersected with their region's venues (lib/region.ts). */
  venues: Venue[];
  /** Show yellow plays (red are hidden unless the user opts in). */
  showYellow: boolean;
  showRed: boolean;
  /** Web push alerts (Pro: instant; Insidir: within 60 seconds). */
  alertPush: boolean;
  /** Email alerts as a backup when push isn't available (paid plans). */
  alertEmail: boolean;
  /** A daily summary email (the only alert channel on the free plan). */
  emailDigest: boolean;
  /** Only alert for plays at or above this ROI. */
  alertMinRoi: number;
  /** A quiet tone in the open Terminal when a new green deal arrives. Off by default. */
  soundOnGreen: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  minRoi: 0.005, minSizeUsd: 0, categories: [], venues: ["kalshi", "polymarket", "polymarket_us"],
  showYellow: true, showRed: false, alertPush: false, alertEmail: false, emailDigest: false, alertMinRoi: 0.01, soundOnGreen: false,
};

export const users = terminal.table("users", {
  /** Whop user id (user_...). */
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  username: text("username"),
  region: text("region").$type<Region>(),
  plan: text("plan").$type<Plan>().notNull().default("free"),
  membershipId: text("membership_id"),
  manageUrl: text("manage_url"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  planCheckedAt: timestamp("plan_checked_at", { withTimezone: true }),
  settings: jsonb("settings").$type<UserSettings>().notNull().default(DEFAULT_SETTINGS),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** When the last daily summary went out (one per day). */
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  visitorId: text("visitor_id"),
  /** First-touch UTM tags carried from the visit that led to signup. */
  utm: jsonb("utm").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Our own sessions. Whop tokens are never stored: after login the membership is read with the account API key. */
export const sessions = terminal.table("sessions", {
  /** SHA-256 of the cookie token. */
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("sessions_user_idx").on(t.userId)]);

export const markets = terminal.table("markets", {
  venue: text("venue").$type<Venue>().notNull(),
  id: text("id").notNull(),
  data: jsonb("data").$type<VMarket>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.venue, t.id] })]);

/** Accepted (and blocked) cross-venue pairs. */
export const pairs = terminal.table("pairs", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<MarketPair>().notNull(),
  safety: text("safety").$type<Safety>().notNull(),
  blocked: boolean("blocked").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every match decision, accepted or rejected, so no pair is judged (or sent to the LLM) twice. */
export const matchDecisions = terminal.table("match_decisions", {
  key: text("key").primaryKey(),
  decision: jsonb("decision").$type<Record<string, unknown>>().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Admin overrides for a pair: force a match, block it, or set its safety light. */
export const matchOverrides = terminal.table("match_overrides", {
  key: text("key").primaryKey(),
  action: text("action").$type<"match" | "block" | "safety">().notNull(),
  inverted: boolean("inverted").notNull().default(false),
  safety: text("safety").$type<Safety>(),
  note: text("note"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = terminal.table("opportunities", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  /** The latest computed state. */
  data: jsonb("data").$type<Opportunity>().notNull(),
  venues: text("venues").array().$type<Venue[]>().notNull(),
  safety: text("safety").$type<Safety>().notNull(),
  roi: doublePrecision("roi").notNull(),
  profitPerDay: doublePrecision("profit_per_day").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
}, t => [index("opps_active_idx").on(t.active, t.profitPerDay)]);

/** The public log: every opportunity as it was at detection, and how it settled. */
export const receipts = terminal.table("receipts", {
  id: serial("id").primaryKey(),
  oppId: text("opp_id").notNull(),
  kind: text("kind").notNull(),
  safety: text("safety").$type<Safety>().notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  /** Prices, fillable size and fees at detection. Never updated. */
  snapshot: jsonb("snapshot").$type<Opportunity>().notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  /** Each leg's market result. */
  results: jsonb("results").$type<Record<string, "yes" | "no" | "void">>(),
  sameWay: boolean("same_way"),
  realizedProfit: doublePrecision("realized_profit"),
}, t => [uniqueIndex("receipts_opp_idx").on(t.oppId), index("receipts_detected_idx").on(t.detectedAt)]);

export const whaleTrades = terminal.table("whale_trades", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<WhaleTrade>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
}, t => [index("whales_at_idx").on(t.at)]);

export const pushSubscriptions = terminal.table("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One alert per user, opportunity and channel, however many workers run. */
export const alertsSent = terminal.table("alerts_sent", {
  userId: text("user_id").notNull(),
  oppId: text("opp_id").notNull(),
  channel: text("channel").$type<"push" | "email">().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.userId, t.oppId, t.channel] })]);

/** First-party funnel events (no third-party trackers needed). */
export const events = terminal.table("events", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  userId: text("user_id"),
  name: text("name").notNull(),
  /** A/B variant the visitor saw, e.g. "hero:b". */
  variant: text("variant"),
  props: jsonb("props").$type<Record<string, string | number | boolean>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("events_name_at_idx").on(t.name, t.at), index("events_visitor_idx").on(t.visitorId)]);

/** Whop webhook ids already processed (deliveries are at-least-once). */
export const webhookEvents = terminal.table("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const llmUsage = terminal.table("llm_usage", {
  month: text("month").primaryKey(),
  usd: doublePrecision("usd").notNull().default(0),
  calls: integer("calls").notNull().default(0),
});

/** Everything the worker sees happen, in order: the live pipe the site streams over Server-Sent Events. Every toast,
 *  tape item and live counter on the site comes from a row here (never invented). `venues` lets the stream apply
 *  the viewer's region. Pruned after 7 days by the worker. */
export const liveEvents = terminal.table("live_events", {
  id: serial("id").primaryKey(),
  type: text("type").$type<"deal_found" | "deal_closed" | "price_tick" | "whale">().notNull(),
  oppId: text("opp_id"),
  venues: text("venues").array().$type<Venue[]>().notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("live_events_at_idx").on(t.at)]);

/** The closest matched market per venue pair at the last scan (lib/engines/near-miss.ts): what the landing page
 *  shows, labelled "Not a deal yet", when there is no deal. Key: the two venues, sorted, joined by "|". */
export const nearMisses = terminal.table("near_misses", {
  venues: text("venues").primaryKey(),
  data: jsonb("data").$type<NearMiss>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

export const workerHeartbeats = terminal.table("worker_heartbeats", {
  job: text("job").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  ok: boolean("ok").notNull(),
  error: text("error"),
  stats: jsonb("stats").$type<Record<string, number | string>>(),
});

export const rateLimits = terminal.table("rate_limits", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, t => [primaryKey({ columns: [t.key, t.windowStart] })]);


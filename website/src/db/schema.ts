import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Auth.js default table name `user`. */
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  plan: text("plan").notNull().default("starter"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Primary recurring Stripe Price id on the subscription; drives priceMapping on account API. */
  stripePriceId: text("stripe_price_id"),
  subscriptionStatus: text("subscription_status").notNull().default("none"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

/** Magic-link send rate limits: one row per (scope, scope_key). */
export const magicLinkSendCounters = pgTable(
  "magic_link_send_counter",
  {
    scope: text("scope").notNull(),
    scopeKey: text("scope_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scope, t.scopeKey] }),
  }),
);

export const apiKeys = pgTable("api_key", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** SHA-256 hex of plaintext key for O(1) lookup (not secret). */
  keyLookupSha256: text("key_lookup_sha256").notNull().unique(),
  /** scrypt$…$… of plaintext key. */
  keyHash: text("key_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
});

export const usageCounters = pgTable(
  "usage_counter",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.apiKeyId, t.yearMonth] }),
  }),
);

export const usageReservations = pgTable(
  "usage_reservation",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    u: unique().on(t.apiKeyId, t.runId),
  }),
);

export const stripeEvents = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { mode: "date" }).notNull().defaultNow(),
});

export const funnelEvents = pgTable("funnel_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  event: text("event").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

/** Idempotent receipt for POST /api/v1/funnel/verify-outcome (one row per api_key + run_id). */
export const verifyOutcomeBeacons = pgTable(
  "verify_outcome_beacon",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.apiKeyId, t.runId] }),
  }),
);

/** Idempotent receipt for POST /api/funnel/product-activation (verify_started). */
export const productActivationStartedBeacons = pgTable("product_activation_started_beacon", {
  runId: text("run_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.runId] }),
}));

/** Idempotent receipt for POST /api/funnel/product-activation (verify_outcome). */
export const productActivationOutcomeBeacons = pgTable("product_activation_outcome_beacon", {
  runId: text("run_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.runId] }),
}));

/** OSS claim bridge: one row per claim_secret hash; authoritative UX after redeem. */
export const ossClaimTickets = pgTable("oss_claim_ticket", {
  secretHash: text("secret_hash").notNull(),
  runId: text("run_id").notNull(),
  terminalStatus: text("terminal_status").notNull(),
  workloadClass: text("workload_class").notNull(),
  subcommand: text("subcommand").notNull(),
  buildProfile: text("build_profile").notNull(),
  issuedAt: text("issued_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.secretHash] }),
}));

/** Hourly rate limits for OSS claim-ticket (per IP) and claim-redeem (per user). */
export const ossClaimRateLimitCounters = pgTable(
  "oss_claim_rate_limit_counter",
  {
    scope: text("scope").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    scopeKey: text("scope_key").notNull(),
    count: integer("count").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scope, t.windowStart, t.scopeKey] }),
  }),
);

/** Persisted public verification report (POST /api/public/verification-reports). */
export const sharedVerificationReports = pgTable("shared_verification_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  reportWorkflowId: varchar("report_workflow_id", { length: 512 }).notNull(),
  reportStatusToken: text("report_status_token").notNull(),
  humanText: text("human_text").notNull(),
});

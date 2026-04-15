import { db } from "@/db/client";
import { dbTelemetry } from "@/db/telemetryClient";
import { sql } from "drizzle-orm";

const CORE_TRUNCATE_SQL = `
  TRUNCATE magic_link_send_counter, oss_claim_ticket, oss_claim_rate_limit_counter, verify_outcome_beacon, funnel_event, stripe_event, usage_reservation, usage_counter, api_key, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE
`;

const TELEMETRY_TRUNCATE_SQL = `
  TRUNCATE funnel_event, product_activation_started_beacon, product_activation_outcome_beacon RESTART IDENTITY CASCADE
`;

/** Clears commercial + telemetry fixture tables used by website integration tests. */
export async function truncateCommercialFixtureDbs(): Promise<void> {
  await db.execute(sql.raw(CORE_TRUNCATE_SQL));
  if (process.env.TELEMETRY_DATABASE_URL?.trim()) {
    await dbTelemetry.execute(sql.raw(TELEMETRY_TRUNCATE_SQL));
  }
}

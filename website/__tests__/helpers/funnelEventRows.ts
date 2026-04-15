import { db } from "@/db/client";
import { dbTelemetry } from "@/db/telemetryClient";
import { funnelEvents } from "@/db/schema";
import { telemetryFunnelEvents } from "@/db/telemetrySchema";
import type { FunnelEventName } from "@/lib/funnelEvents";
import { isTelemetryTierFunnelEvent } from "@/lib/funnelEventTier";
import { eq } from "drizzle-orm";

/**
 * Resolves core vs telemetry `funnel_event` store to match `logFunnelEvent` (see
 * `AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB` + tier split).
 */
export async function selectFunnelEventRowsForTest(event: FunnelEventName) {
  if (
    process.env.AGENTSKEPTIC_TELEMETRY_WRITES_TELEMETRY_DB === "1" &&
    process.env.TELEMETRY_DATABASE_URL?.trim() &&
    isTelemetryTierFunnelEvent(event)
  ) {
    return dbTelemetry
      .select()
      .from(telemetryFunnelEvents)
      .where(eq(telemetryFunnelEvents.event, event));
  }
  return db.select().from(funnelEvents).where(eq(funnelEvents.event, event));
}

import { db } from "@/db/client";
import { funnelEvents } from "@/db/schema";
import type { FunnelEventName } from "@/lib/funnelEvents";

export type LogFunnelEventInput = {
  event: FunnelEventName;
  userId?: string | null;
  metadata?: unknown;
};

/**
 * Best-effort funnel logging. Never throws on DB errors (logs funnel_event_drop to stderr JSON).
 */
export async function logFunnelEvent(input: LogFunnelEventInput): Promise<void> {
  try {
    await db.insert(funnelEvents).values({
      event: input.event,
      userId: input.userId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        kind: "funnel_event_drop",
        event: input.event,
        message,
      }),
    );
  }
}

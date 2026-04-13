import { db } from "@/db/client";
import { funnelEvents } from "@/db/schema";
import type { FunnelEventName } from "@/lib/funnelEvents";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

export type AppDbClient = PostgresJsDatabase<typeof schema>;

export type LogFunnelEventInput = {
  event: FunnelEventName;
  userId?: string | null;
  metadata?: unknown;
};

/**
 * Best-effort funnel logging without a transaction. Never throws on DB errors.
 * When `tx` is passed (webhook transaction), failures propagate so the caller can roll back.
 */
export async function logFunnelEvent(
  input: LogFunnelEventInput,
  tx?: AppDbClient,
): Promise<void> {
  const client = tx ?? db;
  const run = () =>
    client.insert(funnelEvents).values({
      event: input.event,
      userId: input.userId ?? null,
      metadata: input.metadata ?? null,
    });

  if (tx) {
    await run();
    return;
  }

  try {
    await run();
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

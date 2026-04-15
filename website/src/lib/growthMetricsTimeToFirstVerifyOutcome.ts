import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { isFunnelAnonUuidV4 } from "@/lib/funnelAttribution";

/**
 * Executable mirror — must match docs/growth-metrics-ssot.md §TimeToFirstVerifyOutcome_Seconds
 * (enforced by growthMetricsSqlParity.test.ts).
 */
export const TimeToFirstVerifyOutcome_Seconds_SQL = `SELECT (
  EXTRACT(EPOCH FROM (
    (SELECT MIN(created_at) FROM funnel_event fe2 WHERE fe2.event = 'verify_outcome' AND fe2.metadata->>'funnel_anon_id' = $1 AND (fe2.metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev'))
    -
    (SELECT MIN(created_at) FROM funnel_event fe1 WHERE fe1.event = 'acquisition_landed' AND fe1.metadata->>'funnel_anon_id' = $1)
  ))
)::int AS seconds`;

function sqlWithFunnelAnonId(funnelAnonId: string): ReturnType<typeof sql.raw> {
  const lit = `'${funnelAnonId.replace(/'/g, "''")}'`;
  return sql.raw(TimeToFirstVerifyOutcome_Seconds_SQL.replaceAll("$1", lit));
}

/** Returns null if either timestamp side is missing. */
export async function getTimeToFirstVerifyOutcomeSeconds(
  funnelAnonId: string,
): Promise<number | null> {
  if (!isFunnelAnonUuidV4(funnelAnonId)) {
    throw new Error("invalid funnel_anon_id");
  }
  const rows = await db.execute(sqlWithFunnelAnonId(funnelAnonId.toLowerCase()));
  const row = rows[0] as { seconds: number | null } | undefined;
  if (!row || row.seconds === null || Number.isNaN(Number(row.seconds))) {
    return null;
  }
  return Number(row.seconds);
}

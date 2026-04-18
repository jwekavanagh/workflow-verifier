import { dbTelemetry } from "@/db/telemetryClient";
import { sql } from "drizzle-orm";

/**
 * Executable mirror — must match docs/growth-metrics-ssot.md §CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc
 * (enforced by growthMetricsSqlParity.test.ts).
 */
export const CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc_SQL = `WITH w AS (
  SELECT (now() AT TIME ZONE 'UTC') AS now_utc
),
intg AS (
  SELECT DISTINCT metadata->>'funnel_anon_id' AS fid
  FROM funnel_event, w
  WHERE event = 'integrate_landed'
    AND metadata->>'funnel_anon_id' IS NOT NULL
    AND metadata->>'funnel_anon_id' <> ''
    AND created_at >= w.now_utc - interval '7 days'
),
outc AS (
  SELECT DISTINCT metadata->>'funnel_anon_id' AS fid
  FROM funnel_event, w
  WHERE event = 'verify_outcome'
    AND metadata->>'funnel_anon_id' IS NOT NULL
    AND metadata->>'funnel_anon_id' <> ''
    AND (metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')
    AND (metadata->>'workload_class') = 'non_bundled'
    AND (metadata->>'workflow_lineage') = 'integrator_scoped'
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM intg) AS d,
  (SELECT COUNT(*)::int FROM intg INNER JOIN outc ON intg.fid = outc.fid) AS n,
  (SELECT COUNT(*)::float FROM intg INNER JOIN outc ON intg.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM intg), 0) AS rate`;

export type QualifiedIntegrateToIntegratorScopedVerifyOutcomeRolling7dRow = {
  d: number;
  n: number;
  rate: number | null;
};

export async function getQualifiedIntegrateToIntegratorScopedVerifyOutcomeRolling7d(): Promise<QualifiedIntegrateToIntegratorScopedVerifyOutcomeRolling7dRow> {
  const rows = await dbTelemetry.execute(
    sql.raw(CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc_SQL),
  );
  const row = rows[0] as QualifiedIntegrateToIntegratorScopedVerifyOutcomeRolling7dRow | undefined;
  return {
    d: row?.d ?? 0,
    n: row?.n ?? 0,
    rate: row?.rate ?? null,
  };
}

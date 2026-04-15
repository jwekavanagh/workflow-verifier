import { db } from "@/db/client";
import { sql } from "drizzle-orm";

/**
 * Executable mirror — must match docs/growth-metrics-ssot.md §CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc
 * (enforced by growthMetricsSqlParity.test.ts).
 */
export const CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc_SQL = `WITH w AS (
  SELECT (now() AT TIME ZONE 'UTC') AS now_utc
),
acq AS (
  SELECT DISTINCT metadata->>'funnel_anon_id' AS fid
  FROM funnel_event, w
  WHERE event = 'acquisition_landed'
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
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM acq) AS d,
  (SELECT COUNT(*)::int FROM acq INNER JOIN outc ON acq.fid = outc.fid) AS n,
  (SELECT COUNT(*)::float FROM acq INNER JOIN outc ON acq.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM acq), 0) AS rate`;

export type CrossSurfaceConversionRow = { d: number; n: number; rate: number | null };

export async function getCrossSurfaceConversionRolling7d(): Promise<CrossSurfaceConversionRow> {
  const rows = await db.execute(sql.raw(CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc_SQL));
  const row = rows[0] as CrossSurfaceConversionRow | undefined;
  return {
    d: row?.d ?? 0,
    n: row?.n ?? 0,
    rate: row?.rate ?? null,
  };
}

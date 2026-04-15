/** Normative SQL mirror for `docs/growth-metrics-ssot.md` — ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc */
export const ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc_SQL = `
WITH w AS (
  SELECT (now() AT TIME ZONE 'UTC') AS now_utc
)
SELECT COUNT(DISTINCT fe.install_id)::int AS distinct_installs
FROM funnel_event fe
CROSS JOIN w
WHERE fe.event = 'verify_started'
  AND fe.install_id IS NOT NULL
  AND fe.install_id <> ''
  AND (fe.metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')
  AND fe.created_at >= w.now_utc - interval '7 days'
`.trim();

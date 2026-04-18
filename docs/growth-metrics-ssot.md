# Growth metrics — single source of truth

**Epistemic framing:** [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md).

This document is the **normative semantics SSOT** for **operator growth metrics**: cross-surface correlation, conversion, retention, and related KPIs backed by `funnel_event` and `usage_counter` data.

**Two databases:** KPIs that reference **telemetry-tier** funnel events (`acquisition_landed`, `integrate_landed`, `verify_started`, `verify_outcome`) execute against **`TELEMETRY_DATABASE_URL`** (same `funnel_event` table name on that server). Metrics that reference **core-tier** events (for example `reserve_allowed`) execute against **`DATABASE_URL`**. See [`docs/telemetry-storage-ssot.md`](telemetry-storage-ssot.md).

**Executable SQL mirrors** live under `website/src/lib/growthMetrics*.ts` and **must match** the fenced `sql` blocks below after whitespace normalization — enforced by `website/__tests__/growthMetricsSqlParity.test.ts`.

**HTTP ingestion, attribution field shapes, max lengths, and `schema_version` for beacons** are defined only in [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md). This document references **`funnel_anon_id`** as a join key only; it does **not** redefine attribution schema. **`install_id`** (CLI pseudonymous machine cohort on `funnel_event`) is defined only in that SSOT.

**Metric roles:**

| Id | Audience | Purpose |
|----|----------|---------|
| `Retention_ActiveReserveDays_ge2_Rolling28dUtc` | Operator | Rolling 28-day retention on `reserve_allowed` |
| `AccountGauge_DistinctReserveUtcDays_CurrentMonth` | Account UX | Current UTC calendar month activity (see Account API); **not** labeled “retention” in UI |
| `ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc` | Operator | Distinct CLI `install_id` values with ≥1 **non–`local_dev`** `verify_started` in rolling 7 UTC days (install cohort, not humans) |
| `CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc` | Operator | Among acquisition-landed ids in the window, what fraction also have `integrate_landed` in the window (motivation / next-step proxy) |
| `CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc` | Operator | Among integrate-landed ids in the window, what fraction also have a qualifying `verify_outcome` in the window (execution proxy) |
| `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc` | Operator | Same denominator as integrate→`verify_outcome`; numerator restricted to **`verify_outcome`** rows with **`metadata->>'workload_class' = 'non_bundled'`** (path heuristic—see [`funnel-observability-ssot.md`](funnel-observability-ssot.md) §**Qualification proxy (operator)**) |
| `CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc` | Operator | Same denominator as qualified integrate→`verify_outcome`; numerator further requires **`metadata->>'workflow_lineage' = 'integrator_scoped'`** (CLI schema v3—see [`funnel-observability-ssot.md`](funnel-observability-ssot.md) **product-activation v3**) |
| `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc` | Operator | Among integrate-landed ids in the window, what fraction also have ≥1 **qualified** **`verify_started`** in the window (failure mode **A**—missing qualified start signal after integrate impression) |
| `Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc` | Operator | Among qualified **`verify_outcome`** rows in the window, counts by **`terminal_status`** wire literals plus **`malformed_other`** (failure mode **B**—terminal mix + malformed) |

---

## Funnel metadata reference (read-only)

- **`funnel_anon_id`:** pseudonymous correlation id on anonymous `funnel_event` rows (surface + product-activation). Semantics: [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md).
- **`install_id`:** nullable column on `funnel_event` for CLI activation telemetry (default pseudonymous install). Semantics: [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md).
- **`telemetry_source`:** string in `funnel_event.metadata` for activation rows (`verify_started` / `verify_outcome`). Wire v2 sends `local_dev` or `unknown`; v1 clients are stored as **`legacy_unattributed`** server-side. **`unknown` is not “external-only.”** It labels non–`local_dev` client-declared traffic that still posts. Metrics that exclude local operator noise filter with **`metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev'`** (see metric sections below).
- **`workflow_lineage`:** optional string on activation rows from **schema_version 3** bodies only (`catalog_shipped` \| `integrate_spine` \| `integrator_scoped` \| `unknown`). Semantics and classifier: [`src/funnel/workflowLineageClassify.ts`](../src/funnel/workflowLineageClassify.ts); wire: [`docs/funnel-observability-ssot.md`](funnel-observability-ssot.md). Rows without this key (v1/v2 clients) never satisfy **`= 'integrator_scoped'`** filters.

---

### ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Value:** count of **distinct** non-null `install_id` on rows where `event = 'verify_started'` in the window and **`telemetry_source` is not `local_dev`**.

**Note:** This is **install / machine cohort** signal, not weekly active humans.

```sql
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
```

---

### TimeToFirstVerifyOutcome_Seconds

**Question:** For one `funnel_anon_id`, how many seconds from first `acquisition_landed` to first **non–`local_dev`** `verify_outcome`?

**Parameters:** `$1` = `funnel_anon_id` (UUID text).

```sql
SELECT (
  EXTRACT(EPOCH FROM (
    (SELECT MIN(created_at) FROM funnel_event fe2 WHERE fe2.event = 'verify_outcome' AND fe2.metadata->>'funnel_anon_id' = $1 AND (fe2.metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev'))
    -
    (SELECT MIN(created_at) FROM funnel_event fe1 WHERE fe1.event = 'acquisition_landed' AND fe1.metadata->>'funnel_anon_id' = $1)
  ))
)::int AS seconds
```

---

### Operator interpretation contract (funnel decomposition)

Normative rules for reading **stage-separated** cross-surface rates next to the **compressed** acquisition→`verify_outcome` rate. Ingestion HTTP contracts and beacon field shapes are **not** redefined here—only [`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md).

**Allowed inferences**

- **Motivation / “next step from acquisition”:** Use `CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc` among ids that **actually** had `acquisition_landed` in the window. A drop here means acquisition-landed visitors (with a non-empty join id) disproportionately never recorded an integrate surface land in the same window.

- **Execution / “outcome after integrate”:** Use `CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc` among ids that **actually** had `integrate_landed` in the window. A drop here means integrate-landed visitors disproportionately never posted a qualifying activation `verify_outcome` in the same window.

- **Integrate → path-qualified outcome (L1):** Use `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc` for **`non_bundled`** `verify_outcome` after integrate—see that metric’s prohibitions; it remains a **path** heuristic only.

- **Integrate → lineage-qualified outcome (L2 proxy):** Use `CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc` when the question is whether **`verify_outcome`** rows excluded **shipped catalog** and **`wf_integrate_spine`** terminal lineage per [`src/funnel/workflowLineageClassify.ts`](../src/funnel/workflowLineageClassify.ts). A drop versus the L1 rate suggests mass stuck on demo/catalog/spine-shaped workflow ids or legacy v2 beacons—not by itself **where** in the human funnel the loss occurred.

- **End-to-end join (compressed):** Use `CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc` for acquisition-landed ids that also show a qualifying `verify_outcome` with the same join id in the window—**without** requiring an explicit integrate row in SQL.

- **Integrate → qualified start (failure mode A):** Use `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc` among ids that had `integrate_landed` in the window. A drop here means integrate-landed visitors disproportionately never posted a **qualified** `verify_started` (non–`local_dev`, `workload_class = non_bundled`) in the same window—it does **not** prove Step 4 / **ProductionComplete** failure by itself.

- **Qualified outcome terminal mix (failure mode B):** Use `Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc` over qualified `verify_outcome` rows in the window. Compare `complete`, `inconsistent`, `incomplete`, and `malformed_other` (bogus or missing `terminal_status`); wire literals match product activation (`complete` \| `inconsistent` \| `incomplete`).

**Explicit prohibitions (must not)**

- **Integrate-only ids:** If the only in-window surface rows for an id are `integrate_landed` (no in-window `acquisition_landed` for that id), that id **does not** enter the **acquisition→integrate** denominator and **does** enter the **integrate→verify outcome** denominator when integrate fired. Operators **must not** read integrate-only traffic as a failure of the acquisition→integrate rate (that rate’s denominator excludes those ids by definition).

- **Missing join key on activation:** `verify_outcome` rows where `metadata->>'funnel_anon_id'` is null or empty **cannot** increase any cross-surface numerator that joins on that key. Operators **must not** treat a low rate as proof that verification did not run if the CLI did not propagate the browser id (see optional env in [`docs/funnel-observability-ssot.md`](docs/funnel-observability-ssot.md)).

- **Outcome without integrate:** `verify_outcome` **without** an in-window `integrate_landed` for the same id **does not** count toward the **integrate→verify outcome** numerator.

- **Compressed vs decomposed equality:** Operators **must not** assume numeric identity between the compressed rate and any product of the two decomposed rates; cohorts differ (integrate-only traffic, acquisition without integrate, etc.).

- **Exhaustivity:** These decomposition metrics **do not** exhaust user intent, total traffic, or all verification runs. They **do** support bounded comparison of **where** drop-off appears **among rows that satisfy each metric’s denominator rules**.

- **Ranking dominant funnel loss:** Identifying **which** real-world stage loses the most integrators (evaluation vs install vs integrate vs Step 4 vs paid) **cannot be inferred from repository files alone**; that requires time-bounded telemetry and product context—see [Structural throughput constraint](adoption-epistemics-ssot.md#structural-throughput-constraint) in [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md).

---

### Operator cross-metric reading table (operator)

| Metric id | Question it answers | Must not be read as |
|-----------|---------------------|---------------------|
| `CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc` | Among acquisition-landed ids in the window, what fraction also have a qualifying `verify_outcome` in the window? | Proof that the user opened `/integrate`; proof that verification SQL failed; proof of revenue or subscription state |
| `CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc` | Among acquisition-landed ids in the window, what fraction also have `integrate_landed` in the window? | Proof that the user ran the CLI; proof of a successful verify engine run |
| `CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc` | Among integrate-landed ids in the window, what fraction also have a qualifying `verify_outcome` in the window? | Proof that the user ever hit acquisition; proof that `funnel_anon_id` was propagated on every machine |
| `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc` | Among integrate-landed ids in the window, what fraction also posted a **`verify_outcome`** with **`workload_class` = `non_bundled`** in the window? | Proof of ICP or production traffic; proof the integrator understood the product; substitute for user outcome |
| `CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc` | Same as qualified integrate→outcome, but the **`verify_outcome`** must also report **`workflow_lineage` = `integrator_scoped`** (schema v3). | Proof of **ProductionComplete** or **Decision-ready** artifacts (A1–A5); proof the integrate spine terminal (`wf_integrate_spine`) ran; proof of revenue; substitute for **user outcome** |
| `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc` | Among integrate-landed ids in the window, what fraction also have ≥1 qualified **`verify_started`** in the window? | Proof that the customer failed Step 4 / **ProductionComplete**; proof of revenue; substitute for **Decision-ready ProductionComplete** (see [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md)) |
| `Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc` | Among qualified **`verify_outcome`** rows in the window, how many terminal **`complete` / `inconsistent` / `incomplete`** vs malformed? | Proof of integrator-owned inputs or A1–A5 artifacts; proof that a low `complete` count means the engine failed |

---

### CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Denominator `D`:** distinct `funnel_anon_id` with ≥1 `acquisition_landed` in window (non-null, non-empty id in `metadata`).

**Numerator `N`:** distinct ids from `D` with ≥1 `integrate_landed` in the same window (same join id in `metadata`).

**Value:** `N / NULLIF(D, 0)` as float.

```sql
WITH w AS (
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
intg AS (
  SELECT DISTINCT metadata->>'funnel_anon_id' AS fid
  FROM funnel_event, w
  WHERE event = 'integrate_landed'
    AND metadata->>'funnel_anon_id' IS NOT NULL
    AND metadata->>'funnel_anon_id' <> ''
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM acq) AS d,
  (SELECT COUNT(*)::int FROM acq INNER JOIN intg ON acq.fid = intg.fid) AS n,
  (SELECT COUNT(*)::float FROM acq INNER JOIN intg ON acq.fid = intg.fid) / NULLIF((SELECT COUNT(*)::float FROM acq), 0) AS rate
```

---

### CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Denominator `D`:** distinct `funnel_anon_id` with ≥1 `integrate_landed` in window (non-null, non-empty id in `metadata`).

**Numerator `N`:** distinct ids from `D` with ≥1 **non–`local_dev`** `verify_outcome` in the same window (join on `metadata->>'funnel_anon_id'`).

**Value:** `N / NULLIF(D, 0)` as float.

```sql
WITH w AS (
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
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM intg) AS d,
  (SELECT COUNT(*)::int FROM intg INNER JOIN outc ON intg.fid = outc.fid) AS n,
  (SELECT COUNT(*)::float FROM intg INNER JOIN outc ON intg.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM intg), 0) AS rate
```

---

### CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Denominator `D`:** distinct `funnel_anon_id` with ≥1 `integrate_landed` in window (non-null, non-empty id in `metadata`) — **same** as `CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc`.

**Numerator `N`:** distinct ids from `D` with ≥1 **non–`local_dev`** `verify_outcome` in the same window where **`(metadata->>'workload_class') = 'non_bundled'`** (join on `metadata->>'funnel_anon_id'`).

**Value:** `N / NULLIF(D, 0)` as float.

**Explicit prohibitions (must not):**

- **`non_bundled`** is assigned by [`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts); it is **not** proof of customer data or ICP fit—see [`funnel-observability-ssot.md`](funnel-observability-ssot.md) §**Qualification proxy (operator)**.
- Rows where **`workload_class`** is null or not exactly **`non_bundled`** do **not** count toward **`N`** (including legacy rows missing the key).

```sql
WITH w AS (
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
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM intg) AS d,
  (SELECT COUNT(*)::int FROM intg INNER JOIN outc ON intg.fid = outc.fid) AS n,
  (SELECT COUNT(*)::float FROM intg INNER JOIN outc ON intg.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM intg), 0) AS rate
```

---

### CrossSurface_ConversionRate_QualifiedIntegrateToIntegratorScopedVerifyOutcome_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Denominator `D`:** same as `CrossSurface_ConversionRate_QualifiedIntegrateToVerifyOutcome_Rolling7dUtc` (distinct `funnel_anon_id` with `integrate_landed` in window).

**Numerator `N`:** distinct ids from `D` with ≥1 **non–`local_dev`** `verify_outcome` in the same window where **`(metadata->>'workload_class') = 'non_bundled'`** and **`(metadata->>'workflow_lineage') = 'integrator_scoped'`** (join on `metadata->>'funnel_anon_id'`).

**Value:** `N / NULLIF(D, 0)` as float.

**Explicit prohibitions (must not):**

- **`integrator_scoped`** is assigned only by the published CLI using [`src/funnel/workflowLineageClassify.ts`](../src/funnel/workflowLineageClassify.ts) on **schema_version 3** activation bodies. It is **not** human A4 attestation, **not** **Decision-ready ProductionComplete**, and **not** proof that events/registry were integrator-authored (for example an arbitrary workflow id or quick **non_bundled** paths can still yield **`integrator_scoped`**).
- **`verify_outcome`** rows from **v1/v2** clients (no `workflow_lineage` key) **never** enter **`N`**.
- **`unknown`** lineage (empty batch `--workflow-id`) is excluded from **`N`** by the equality filter.

```sql
WITH w AS (
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
  (SELECT COUNT(*)::float FROM intg INNER JOIN outc ON intg.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM intg), 0) AS rate
```

---

### CrossSurface_ConversionRate_QualifiedIntegrateToVerifyStarted_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Question:** Among `funnel_anon_id` with `integrate_landed` in the window, what fraction also has ≥1 **qualified** `verify_started` in the same window?

**Qualified `verify_started`:** `event = 'verify_started'` with non-null non-empty `metadata->>'funnel_anon_id'`, **`(metadata->>'workload_class') = 'non_bundled'`**, and **`(metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')`**. NULL `telemetry_source` key counts as qualified (same rule as other qualified activation metrics).

**Denominator `D`:** distinct `funnel_anon_id` with `integrate_landed` in window (**no** `telemetry_source` or `workload_class` filter on integrate rows).

**Numerator `N`:** distinct ids in `D` that also appear in qualified `verify_started` in the same window.

**Value:** `N / NULLIF(D, 0)` as float (null when `D = 0`).

**Explicit prohibitions (must not):**

- **Low Metric 1 does not prove** the integrator failed **Step 4** or **ProductionComplete**; it proves missing qualified **start** signal after an integrate impression in the rolling window.

```sql
WITH w AS (
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
started AS (
  SELECT DISTINCT metadata->>'funnel_anon_id' AS fid
  FROM funnel_event, w
  WHERE event = 'verify_started'
    AND metadata->>'funnel_anon_id' IS NOT NULL
    AND metadata->>'funnel_anon_id' <> ''
    AND (metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')
    AND (metadata->>'workload_class') = 'non_bundled'
    AND created_at >= w.now_utc - interval '7 days'
)
SELECT
  (SELECT COUNT(*)::int FROM intg) AS d,
  (SELECT COUNT(*)::int FROM intg INNER JOIN started ON intg.fid = started.fid) AS n,
  (SELECT COUNT(*)::float FROM intg INNER JOIN started ON intg.fid = started.fid) / NULLIF((SELECT COUNT(*)::float FROM intg), 0) AS rate
```

---

### Counts_QualifiedVerifyOutcomesByTerminalStatus_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Population `q`:** `event = 'verify_outcome'` with **`(metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')`**, **`(metadata->>'workload_class') = 'non_bundled'`**, and `created_at` in window.

**Buckets:** `complete`, `inconsistent`, `incomplete` via equality on `metadata->>'terminal_status'` to those three wire literals (see [`website/src/lib/funnelProductActivation.contract.ts`](../website/src/lib/funnelProductActivation.contract.ts) `terminalStatusSchema`).

**`malformed_other`:** `total - complete - inconsistent - incomplete` where `total = COUNT(*)` over `q` (includes NULL or non-wire `terminal_status`).

**Explicit prohibitions (must not):**

- **Bucket counts are not** proof of **Decision-ready ProductionComplete** or integrator-retained artifacts **A1–A5**; those are defined only in [`adoption-epistemics-ssot.md`](adoption-epistemics-ssot.md).

```sql
WITH w AS (
  SELECT (now() AT TIME ZONE 'UTC') AS now_utc
),
q AS (
  SELECT *
  FROM funnel_event, w
  WHERE event = 'verify_outcome'
    AND (metadata->>'telemetry_source' IS DISTINCT FROM 'local_dev')
    AND (metadata->>'workload_class') = 'non_bundled'
    AND created_at >= w.now_utc - interval '7 days'
),
agg AS (
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE metadata->>'terminal_status' = 'complete')::int AS complete,
    COUNT(*) FILTER (WHERE metadata->>'terminal_status' = 'inconsistent')::int AS inconsistent,
    COUNT(*) FILTER (WHERE metadata->>'terminal_status' = 'incomplete')::int AS incomplete
  FROM q
)
SELECT
  total,
  complete,
  inconsistent,
  incomplete,
  (total - complete - inconsistent - incomplete) AS malformed_other
FROM agg
```

---

### CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc

**Window:** rolling **7** UTC days from `now() AT TIME ZONE 'UTC'`.

**Denominator `D`:** distinct `funnel_anon_id` with ≥1 `acquisition_landed` in window (non-null id).

**Numerator `N`:** distinct ids from `D` with ≥1 **non–`local_dev`** `verify_outcome` in window.

**Value:** `N / NULLIF(D, 0)` as float.

```sql
WITH w AS (
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
  (SELECT COUNT(*)::float FROM acq INNER JOIN outc ON acq.fid = outc.fid) / NULLIF((SELECT COUNT(*)::float FROM acq), 0) AS rate
```

---

### Retention_ActiveReserveDays_ge2_Rolling28dUtc

**Window:** rolling **28** UTC days.

**Denominator:** distinct `user_id` with ≥1 `reserve_allowed` in window.

**Numerator:** distinct `user_id` in denominator with ≥2 distinct UTC calendar dates of `reserve_allowed` in window.

**Value:** `numerator / NULLIF(denominator, 0)`.

```sql
WITH w AS (
  SELECT (now() AT TIME ZONE 'UTC') AS t
),
denom AS (
  SELECT DISTINCT fe.user_id
  FROM funnel_event fe
  CROSS JOIN w
  WHERE fe.event = 'reserve_allowed'
    AND fe.user_id IS NOT NULL
    AND fe.created_at >= w.t - interval '28 days'
),
num AS (
  SELECT d.user_id
  FROM denom d
  INNER JOIN funnel_event e ON e.user_id = d.user_id AND e.event = 'reserve_allowed'
  CROSS JOIN w
  WHERE e.created_at >= w.t - interval '28 days'
  GROUP BY d.user_id
  HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'UTC')::date) >= 2
)
SELECT
  (SELECT COUNT(*)::int FROM num) AS numerator,
  (SELECT COUNT(*)::int FROM denom) AS denominator,
  (SELECT COUNT(*)::float FROM num) / NULLIF((SELECT COUNT(*)::float FROM denom), 0) AS rate
```

---

## Validation (release gate)

`npm run validate-commercial` runs website Vitest including SQL parity and growth doc boundary tests.

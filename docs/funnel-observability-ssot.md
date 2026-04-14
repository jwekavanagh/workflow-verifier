# Funnel observability — single source of truth

This document is the **SSOT** for **North Star funnel metrics**: measurable progression from canonical acquisition → integrate → **CLI verification attempts and outcomes** (OSS and commercial) → **licensed verification completion** where applicable. It does **not** change verification semantics, entitlements, or OpenAPI integrator contracts.

**Not duplicated here:** Stripe billing and `POST /api/v1/usage/reserve` behavior remain in [`commercial-ssot.md`](commercial-ssot.md). Integrator first-run steps remain in [`first-run-integration.md`](first-run-integration.md).

---

## Audiences

### Engineer

| Surface | Method | Path | Response |
|---------|--------|------|----------|
| Anonymous page beacon | `POST` | `/api/funnel/surface-impression` | `204` success; `400` bad JSON/body; `403` failed origin guard |
| CLI product activation (OSS + commercial) | `POST` | `/api/funnel/product-activation` | See [HTTP table](#post-apifunnelproduct-activation-http-semantics) |
| Licensed completion beacon | `POST` | `/api/v1/funnel/verify-outcome` | See [HTTP table](#post-apiv1funnelverify-outcome-http-semantics) |

**`POST /api/funnel/surface-impression`**

- **Body:** `{ "surface": "acquisition" | "integrate" }` (JSON).
- **Origin guard:** `Origin` or `Referer` must parse to the **same origin** as `getCanonicalSiteOrigin()` in the website server (see [`website/src/lib/canonicalSiteOrigin.ts`](../website/src/lib/canonicalSiteOrigin.ts)).
- **Persistence:** `funnel_event.event` is `acquisition_landed` or `integrate_landed`; `user_id` is null; `metadata` is `{ "schema_version": 1, "surface": "<same as body>" }`.

**`POST /api/funnel/product-activation`**

- **Not in** [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml) — operator-only; integrators must not depend on it.
- **Auth:** none (anonymous). **Required headers:** `X-AgentSkeptic-Product: cli` and `X-AgentSkeptic-Cli-Version: <semver>` (semver core validated server-side; emitted from root `package.json` at anchor sync into [`src/publicDistribution.generated.ts`](../src/publicDistribution.generated.ts) as `AGENTSKEPTIC_CLI_SEMVER`).
- **Body:** discriminated union on `event`:
  - `verify_started`: `{ "event": "verify_started", "schema_version": 1, "run_id": string, "issued_at": ISO8601, "workload_class": "bundled_examples"|"non_bundled", "subcommand": "batch_verify"|"quick_verify", "build_profile": "oss"|"commercial" }`
  - `verify_outcome`: same fields plus `"terminal_status": "complete"|"inconsistent"|"incomplete"`
- **Skew:** `issued_at` must be within **±300 seconds** of server time (same budget as `issued_at` on `POST /api/v1/usage/reserve`).
- **Body size:** UTF-8 body must be **≤ 4096 bytes**; `Content-Length` larger than the cap yields **`413`** without reading beyond the limit when the header is present.
- **Idempotency:** `product_activation_started_beacon.run_id` and `product_activation_outcome_beacon.run_id` (each primary key `run_id`). First successful request for a phase inserts the beacon row and **one** corresponding `funnel_event` row (`verify_started` or `verify_outcome`). Duplicates return **`204`** with **no** additional funnel rows for that phase.

#### `POST /api/funnel/product-activation` HTTP semantics

| Condition | Status | `funnel_event` |
|-----------|--------|----------------|
| Missing/invalid JSON or body fails validation | `400` | No |
| `issued_at` skew too large | `400` | No |
| Missing/invalid CLI marker headers | **`403`** | No |
| Body larger than cap | **`413`** | No |
| First success for `run_id` + phase | **`204`** | Yes, exactly one row for that phase |
| Duplicate `run_id` for same phase | **`204`** | No additional row |
| Database error inside transaction | **`503`** | No |

**CLI opt-out:** set **`AGENTSKEPTIC_TELEMETRY=0`** to disable **only** `POST /api/funnel/product-activation` from the CLI (no `verify_started` / `verify_outcome` posts). Licensed completion (`POST /api/v1/funnel/verify-outcome`) is unchanged so monetization metrics stay comparable.

**CLI origin override:** **`AGENTSKEPTIC_TELEMETRY_ORIGIN`** (optional) overrides the POST base URL (trailing slash stripped). When unset, the CLI uses **`COMMERCIAL_LICENSE_API_BASE_URL`** on commercial builds and otherwise **`PUBLIC_CANONICAL_SITE_ORIGIN`** from anchor sync (same canonical site origin as the distribution footer).

**Transport:** best-effort `fetch` with **~400ms** wall-clock bound (abort controller + `clearTimeout` in `finally`, not `AbortSignal.timeout`, so short-lived CLI exits stay clean on Windows); failures never change verification exit codes.

**`POST /api/v1/funnel/verify-outcome`**

- **Not in** [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml) — operator-only; integrators should not depend on it.
- **Auth:** `Authorization: Bearer <api_key>` (same key material as license preflight).
- **Body:** `{ "run_id": string, "terminal_status": "complete"|"inconsistent"|"incomplete", "workload_class": "bundled_examples"|"non_bundled", "subcommand": "batch_verify"|"quick_verify" }`.
- **Gates:** `run_id` must exist in `usage_reservation` for the resolved API key; reservation `created_at` must be **no older than 6 hours** (wall clock, server time).
- **Idempotency:** table `verify_outcome_beacon` primary key `(api_key_id, run_id)`. First successful request inserts the beacon row and **one** `licensed_verify_outcome` funnel row. Duplicates return **`204`** with **no** additional funnel rows.

#### `POST /api/v1/funnel/verify-outcome` HTTP semantics

| Condition | Status | `funnel_event` (`licensed_verify_outcome`) |
|-----------|--------|---------------------------------------------|
| Missing/invalid JSON or body fails validation | `400` | No |
| Missing/invalid Bearer or API key not verified | `401` | No |
| `run_id` not reserved for this key | `404` | No |
| Reservation older than **6 hours** | **`410`** | No |
| First success | **`204`** | Yes, exactly once |
| Duplicate `(api_key_id, run_id)` | **`204`** | No additional row |

**Constant:** `VERIFY_OUTCOME_BEACON_MAX_RESERVATION_AGE_MS = 6 * 60 * 60 * 1000` in [`website/src/lib/funnelVerifyOutcomeConstants.ts`](../website/src/lib/funnelVerifyOutcomeConstants.ts).

**Funnel metadata** for `licensed_verify_outcome`: `{ "schema_version": 1, "terminal_status", "workload_class", "subcommand" }` (validated in [`website/src/lib/funnelCommercialMetadata.ts`](../website/src/lib/funnelCommercialMetadata.ts)).

### Integrator

These funnel surfaces are **telemetry only**. They do **not** affect whether verification is correct, whether `reserve` succeeds, or CLI exit codes. Failures on the beacon path are ignored by the CLI (best-effort). **`verify_started` / `verify_outcome` rows may be absent** (offline runs, opt-out, timeouts); product behavior must never depend on them.

### Operator

**Why not Vercel-only page views:** Page views do not correlate `run_id` to a completed licensed run. This design stores **queryable rows** in Postgres.

**Why not `reserve_allowed` as completion:** `reserve` is **preflight** before the engine runs; completion requires a terminal workflow / quick rollup outcome.

**Why `terminal_status` includes `inconsistent`:** The engine still evaluated the workload; that is activation signal distinct from “reserve only.”

**Why 6 hours:** Single fixed window between reserve and completion beacon without per-deployment tunables.

**Why `410` on expiry:** Distinguishes unknown `run_id` (`404`) from a reservation that **existed** but is too old (`410`).

**Why duplicate `204`:** Idempotent retries must not double-count activation.

**Operational definition of `workload_class`:** The CLI classifies paths against a **fixed allowlist** of shipped example files (see [`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts)). `non_bundled` is the default when Postgres is used, stdin (`-`) is used for quick input, or any path is outside that allowlist. This is **not** cryptographic proof of customer data—only a deterministic split from bundled demos.

**Quick rollup → `terminal_status`:** [`src/commercial/quickVerifyFunnelTerminalStatus.ts`](../src/commercial/quickVerifyFunnelTerminalStatus.ts): `pass` → `complete`, `fail` → `inconsistent`, `uncertain` → `incomplete`.

#### Example SQL (weekly counts)

Replace date window as needed (`created_at` is timestamptz on `funnel_event`).

```sql
-- (1) Acquisition impressions
SELECT count(*) AS acquisition_landed
FROM funnel_event
WHERE event = 'acquisition_landed'
  AND created_at >= now() - interval '7 days';

-- (2) Integrate impressions
SELECT count(*) AS integrate_landed
FROM funnel_event
WHERE event = 'integrate_landed'
  AND created_at >= now() - interval '7 days';

-- (3) Licensed verification completions (non-bundled workload in metadata)
SELECT count(*) AS licensed_non_bundled
FROM funnel_event
WHERE event = 'licensed_verify_outcome'
  AND created_at >= now() - interval '7 days'
  AND metadata->>'workload_class' = 'non_bundled';
```

**Privacy:** No file contents or connection strings are logged—only enums, `run_id` for activation rows (in `metadata` and dedupe receipts), `run_id` correlation via `usage_reservation` for licensed completion, and classified path buckets.

```sql
-- (4) CLI verification attempts (activation; OSS + commercial)
SELECT count(*) AS verify_started
FROM funnel_event
WHERE event = 'verify_started'
  AND created_at >= now() - interval '7 days';

-- (5) CLI verification outcomes reaching a terminal verdict
SELECT count(*) AS verify_outcome
FROM funnel_event
WHERE event = 'verify_outcome'
  AND created_at >= now() - interval '7 days';

-- (6) Non-bundled activation outcomes (real workload signal, still not proof of customer data)
SELECT count(*) AS activation_non_bundled
FROM funnel_event
WHERE event = 'verify_outcome'
  AND created_at >= now() - interval '7 days'
  AND metadata->>'workload_class' = 'non_bundled';
```

---

## Validation (release gate)

From the repository root, **`npm run validate-commercial`** must pass (includes website Vitest with DB migrations applied). That is the binary gate for this SSOT’s implementation staying green.

**Manual smoke:** run a local OSS `verify` or `quick` against a deployment with `DATABASE_URL` migrated, **`AGENTSKEPTIC_TELEMETRY` unset**, and confirm one `verify_started` and one `verify_outcome` row appear for a single `run_id` in `funnel_event` (and matching rows in `product_activation_*_beacon`). With **`AGENTSKEPTIC_TELEMETRY=0`**, confirm **no** new rows for that run.

# Funnel observability — single source of truth

This document is the **SSOT** for **North Star funnel metrics**: measurable progression from canonical acquisition → integrate → **CLI verification attempts and outcomes** (OSS and commercial) → **licensed verification completion** where applicable. It does **not** change verification semantics, entitlements, or OpenAPI integrator contracts.

**Not duplicated here:** Stripe billing and `POST /api/v1/usage/reserve` behavior remain in [`commercial-ssot.md`](commercial-ssot.md). Integrator first-run steps remain in [`first-run-integration.md`](first-run-integration.md).

**OSS account claim (binding `run_id` → `user_id`):** Normative HTTP, CLI origin, rate limits, TTL, retention, and same-browser rules live only in [`oss-account-claim-ssot.md`](oss-account-claim-ssot.md). `run_id` is never a public bearer secret; do not add public lookup by `run_id`.

**Telemetry-tier persistence:** Which rows live on core vs telemetry Postgres, cutover order, freeze, and backfill are documented only in [`docs/telemetry-storage-ssot.md`](telemetry-storage-ssot.md).

---

## Audiences

### Engineer

The signed-in **`/account`** page lists recent **licensed verify outcomes** per user by reading `funnel_event` rows where `event === 'licensed_verify_outcome'` and `user_id` matches the signed-in account. The loader **`loadAccountPageVerificationActivity`** in [`website/src/lib/funnelObservabilityQueries.ts`](../website/src/lib/funnelObservabilityQueries.ts) is the only supported read path for that UI; there is **no** new public HTTP route for it.

| Surface | Method | Path | Response |
|---------|--------|------|----------|
| Anonymous page beacon | `POST` | `/api/funnel/surface-impression` | **`200`** JSON success; `400` bad JSON/body/attribution; `403` failed origin guard |
| CLI product activation (OSS + commercial) | `POST` | `/api/funnel/product-activation` | See [HTTP table](#post-apifunnelproduct-activation-http-semantics) |
| Licensed completion beacon | `POST` | `/api/v1/funnel/verify-outcome` | See [HTTP table](#post-apiv1funnelverify-outcome-http-semantics) |

**`POST /api/funnel/surface-impression`**

- **Body (JSON, strict keys):** `{ "surface": "acquisition" | "integrate", "funnel_anon_id"?: UUIDv4, "attribution"?: { … } }`.
  - **`funnel_anon_id`:** optional. When omitted or invalid, server **mints** a new UUIDv4 and returns it in the response (clients should persist and resend).
  - **`attribution`:** optional object with **only** these optional string keys (omit keys rather than send empty strings): `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `landing_path`, `referrer_path`. After trim: no control characters, no `://` substring, **`utm_*` max 128 Unicode code points**, **`landing_path` / `referrer_path` max 512 Unicode code points**; unknown keys or violations → **`400`** (no row).
- **Origin guard:** `Origin` or `Referer` must parse to the **same origin** as `getCanonicalSiteOrigin()` in the website server (see [`website/src/lib/canonicalSiteOrigin.ts`](../website/src/lib/canonicalSiteOrigin.ts)).
- **Persistence:** `funnel_event.event` is `acquisition_landed` or `integrate_landed`; `user_id` is null; `metadata` is `{ "schema_version": 1, "surface", "funnel_anon_id", "attribution" }` (normalized `attribution` object, possibly `{}`).
- **Success response:** **`200`** `Content-Type: application/json` body `{ "schema_version": 1, "funnel_anon_id": "<uuid>" }` (echoes minted or validated id).

**`POST /api/funnel/product-activation`**

- **Not in** [`schemas/openapi-commercial-v1.yaml`](../schemas/openapi-commercial-v1.yaml) — operator-only; integrators must not depend on it.
- **Auth:** none (anonymous). **Required headers:** `X-AgentSkeptic-Product: cli` and `X-AgentSkeptic-Cli-Version: <semver>` (semver core validated server-side; emitted from root `package.json` at anchor sync into [`src/publicDistribution.generated.ts`](../src/publicDistribution.generated.ts) as `AGENTSKEPTIC_CLI_SEMVER`).
- **Body:** discriminated union on `event` and **`schema_version`** (**v1** requires **`schema_version`: 1**; current CLI sends **`schema_version`: 2**):
  - **`schema_version`: 1 — `verify_started`:** `{ "event": "verify_started", "schema_version": 1, "run_id": string, "issued_at": ISO8601, "workload_class": "bundled_examples"|"non_bundled", "subcommand": "batch_verify"|"quick_verify", "build_profile": "oss"|"commercial", "funnel_anon_id"?: UUIDv4, "install_id"?: UUID }`
  - **`schema_version`: 1 — `verify_outcome`:** same fields as `verify_started` plus `"terminal_status": "complete"|"inconsistent"|"incomplete"` and optional **`funnel_anon_id`** / **`install_id`** (UUID).
  - **`schema_version`: 2 — `verify_started`:** v1 `verify_started` fields plus required **`telemetry_source`**: `"local_dev"` \| `"unknown"`. Reject **`legacy_unattributed`** on the wire for v2 (**`400`**).
  - **`schema_version`: 2 — `verify_outcome`:** v1 `verify_outcome` fields plus required **`telemetry_source`**: `"local_dev"` \| `"unknown"`. Reject **`legacy_unattributed`** on the wire for v2 (**`400`**).
  - When **`funnel_anon_id`** or **`install_id`** is present, invalid UUID → **`400`**. Optional env **`AGENTSKEPTIC_FUNNEL_ANON_ID`** on the CLI populates **`funnel_anon_id`** on commercial/OSS telemetry posts. **`install_id`** is populated by the CLI by default from a pseudonymous id persisted under **`~/.agentskeptic/config.json`** (see below); omitting **`install_id`** remains valid for older clients and stores **`funnel_event.install_id` = NULL**.
- **Persistence (server):** On first successful insert for a phase, `funnel_event` rows include nullable column **`install_id`** (canonical; not duplicated inside `metadata` JSON). Value is taken from the request body when valid; otherwise SQL `NULL`. **`metadata.telemetry_source`:** v2 echoes the wire enum; v1 inserts are stored as **`legacy_unattributed`**. **`unknown` is not “external-only.”** It labels non–`local_dev` client-declared activation posts.
- **Skew:** `issued_at` must be within **±300 seconds** of server time (same budget as `issued_at` on `POST /api/v1/usage/reserve`).
- **Body size:** UTF-8 body must be **≤ 4096 bytes**; `Content-Length` larger than the cap yields **`413`** without reading beyond the limit when the header is present.
- **Idempotency:** On the telemetry Postgres, `product_activation_started_beacon.run_id` and `product_activation_outcome_beacon.run_id` (each primary key `run_id`). First successful request for a phase inserts the beacon row and **one** corresponding telemetry `funnel_event` row (`verify_started` or `verify_outcome`). Duplicates return **`204`** with **no** additional funnel rows for that phase.

#### `POST /api/funnel/product-activation` HTTP semantics

| Condition | Status | `funnel_event` |
|-----------|--------|----------------|
| `AGENTSKEPTIC_TELEMETRY_CORE_WRITE_FREEZE=1` (maintenance) | **`503`** | No |
| Server missing `TELEMETRY_DATABASE_URL` | **`503`** | No |
| Missing/invalid JSON or body fails validation | `400` | No |
| Invalid **`install_id`** or **`funnel_anon_id`** (when present) | `400` | No |
| `issued_at` skew too large | `400` | No |
| Missing/invalid CLI marker headers | **`403`** | No |
| Body larger than cap | **`413`** | No |
| First success for `run_id` + phase | **`204`** | Yes, exactly one row for that phase (with **`install_id`** set from body or `NULL` if omitted) |
| Duplicate `run_id` for same phase | **`204`** | No additional row |
| Database error inside transaction | **`503`** | No |

**CLI default `install_id`:** The Node CLI mints or reads a stable pseudonymous UUID, persists it locally at **`~/.agentskeptic/config.json`** (`{ "install_id": "<uuid>" }`), and sends it as **`install_id`** on every **`verify_started`** and **`verify_outcome`** activation POST when telemetry is enabled. If the file is missing, malformed, or not writable, the CLI uses a **process-lifetime** fallback id so both phases in one run still share the same value. **`AGENTSKEPTIC_TELEMETRY=0`** disables activation posts **and** skips reading or writing this file.

**CLI opt-out:** set **`AGENTSKEPTIC_TELEMETRY=0`** to disable anonymous CLI **`fetch`** for **`POST /api/funnel/product-activation`** (no `verify_started` / `verify_outcome` posts), **`POST /api/oss/claim-ticket`**, and the **stderr claim URL** helper (no stderr lines; no claim-ticket network). Licensed completion (`POST /api/v1/funnel/verify-outcome`) is unchanged so monetization metrics stay comparable.

**CLI `telemetry_source`:** when telemetry is enabled, the CLI sends v2 bodies with **`telemetry_source`** from **`AGENTSKEPTIC_TELEMETRY_SOURCE`**: trim-equal **`local_dev`** → wire **`local_dev`**; otherwise **`unknown`** (resolver in `src/telemetry/resolveTelemetrySource.ts`).

**CLI origin override:** **`AGENTSKEPTIC_TELEMETRY_ORIGIN`** (optional) overrides the POST base URL (trailing slash stripped). When unset, the CLI uses **`COMMERCIAL_LICENSE_API_BASE_URL`** on commercial builds and otherwise **`PUBLIC_CANONICAL_SITE_ORIGIN`** from anchor sync (same canonical site origin as the distribution footer). **Split deployments:** if the license API origin does **not** host the Next.js **`/api/funnel/product-activation`** route, activation rows will never land unless you set **`AGENTSKEPTIC_TELEMETRY_ORIGIN`** to the site origin that does — see [Operator reading metrics](#operator-reading-metrics-do-not-double-count).

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

## CLI lock telemetry sequencing {#cli-lock-telemetry-sequencing}

Normative implementation: [`src/cli/lockOrchestration.ts`](../src/cli/lockOrchestration.ts) (batch + quick; verify CLI and `enforce`).

- **VS (`verify_started`):** emitted once per lock run **after** successful license **R** when the commercial build runs reserve, and **before** `await executeBatchLockFromParsed` / `await executeQuickLockFromParsed`.
- **VO (`verify_outcome`)** and **anonymous OSS claim stderr** (`maybeEmitOssClaimTicketUrlToStderr`): emitted **only** when the lock executor returns **`workflow_terminal`**, **`lock_mismatch`**, or **`operational` with a real verification object** (`verifiedResult` / `verifiedOutcome`). The executor **never** fabricates a `WorkflowResult` or quick report for telemetry.
- **`POST /api/v1/funnel/verify-outcome`:** best-effort **only** when a **`run_id`** was obtained from reserve **and** the same VO eligibility as above applies (commercial build).
- **Partial activation (allowed):** **`verify_started`** without **`verify_outcome`** when the executor returns **`operational`** **without** `verifiedResult` / `verifiedOutcome` (failure after VS but before a terminal verification object exists). On that path the CLI must **not** emit **`verify_outcome`**, must **not** call the licensed verify-outcome beacon, and must **not** run the OSS claim-ticket stderr helper.

Commercial vs OSS lock flags are normative in [`commercial-enforce-gate-normative.md`](commercial-enforce-gate-normative.md); that document links here for ordering.

### Operator

#### Operator reading metrics (do not double-count)

**Two outcome signals for commercial `quick` / batch `verify`:** the CLI may persist **both** of the following for the same successful run. They answer different questions; **do not add them into one “total completions” number.**

| `funnel_event.event` | Role | Typical use |
|----------------------|------|-------------|
| **`verify_outcome`** | Anonymous **activation** telemetry (`POST /api/funnel/product-activation`). | “Did a run reach a terminal verdict?” (OSS + commercial builds that POST successfully.) |
| **`licensed_verify_outcome`** | **Licensed completion** (`POST /api/v1/funnel/verify-outcome`; requires reservation + API key). | Monetization / entitlement-adjacent reporting: “Did a keyed customer complete on the license server?” |

**Identity roles (do not conflate):** **`funnel_anon_id`** in request/`metadata` is an optional **browser–CLI** join when the operator sets **`AGENTSKEPTIC_FUNNEL_ANON_ID`** from the site beacon. **`install_id`** on **`funnel_event`** is the default **CLI machine cohort** (not a human); operator SQL for distinct installs on **`verify_started`** is in [`growth-metrics-ssot.md`](growth-metrics-ssot.md) (`ActiveInstalls_DistinctInstallId_VerifyStarted_Rolling7dUtc`).

**`build_profile` in activation metadata (`oss` \| `commercial`):** reflects the **CLI build** (`LICENSE_PREFLIGHT_ENABLED` at compile time), **not** a live subscription check. Do not treat **`commercial`** as proof of an active paid plan.

**When to set `AGENTSKEPTIC_TELEMETRY_ORIGIN`:** (1) **`COMMERCIAL_LICENSE_API_BASE_URL`** points at a deployment that **does not** serve **`POST /api/funnel/product-activation`** (license-only vs full site). (2) You want activation rows written to **your** origin (fork, staging, dedicated analytics host) instead of the defaults below.

**Default POST base when `AGENTSKEPTIC_TELEMETRY_ORIGIN` is unset:** **Commercial CLI:** same origin as **`COMMERCIAL_LICENSE_API_BASE_URL`** (that deployment must expose **`/api/funnel/product-activation`**). **OSS CLI:** **`PUBLIC_CANONICAL_SITE_ORIGIN`** from anchor sync ([`src/publicDistribution.generated.ts`](../src/publicDistribution.generated.ts)) — forks and local OSS builds send best-effort activation posts there unless overridden.

**`verify_started` without `verify_outcome` (same `run_id` in metadata):** means **no terminal activation outcome row was accepted** by the server (or never sent). Causes include: **`AGENTSKEPTIC_TELEMETRY=0`** before the outcome POST, network or timeout, **`issued_at`** skew **`400`**, missing route on the POST origin, CLI **exit 3** before the outcome POST, or engine failure before a terminal result. **Do not** read this pattern as “user abandoned” by itself — it is only “no persisted activation outcome for that run.”

**Operator SQL for KPIs (cross-surface, retention, conversion):** Do not duplicate metric SQL in this document — the normative definitions and fenced SQL live in [`docs/growth-metrics-ssot.md`](growth-metrics-ssot.md), with executable mirrors in `website/src/lib/growthMetrics*.ts` enforced by Vitest parity tests.

- **Stage-separated conversion metric ids (definitions and interpretation contract only in growth SSOT):** `CrossSurface_ConversionRate_AcquisitionToIntegrate_Rolling7dUtc`, `CrossSurface_ConversionRate_IntegrateToVerifyOutcome_Rolling7dUtc`; the compressed cross-surface summary remains `CrossSurface_ConversionRate_AcquisitionToVerifyOutcome_Rolling7dUtc` — [`docs/growth-metrics-ssot.md`](growth-metrics-ssot.md).

**Why not Vercel-only page views:** Page views do not correlate `run_id` to a completed licensed run. This design stores **queryable rows** in Postgres.

**Why not `reserve_allowed` as completion:** `reserve` is **preflight** before the engine runs; completion requires a terminal workflow / quick rollup outcome.

**Why `terminal_status` includes `inconsistent`:** The engine still evaluated the workload; that is activation signal distinct from “reserve only.”

**Why 6 hours:** Single fixed window between reserve and completion beacon without per-deployment tunables.

**Why `410` on expiry:** Distinguishes unknown `run_id` (`404`) from a reservation that **existed** but is too old (`410`).

**Why duplicate `204`:** Idempotent retries must not double-count activation.

**Operational definition of `workload_class`:** The CLI classifies paths against a **fixed allowlist** of shipped example files (see [`src/commercial/verifyWorkloadClassify.ts`](../src/commercial/verifyWorkloadClassify.ts)). `non_bundled` is the default when Postgres is used, stdin (`-`) is used for quick input, or any path is outside that allowlist. This is **not** cryptographic proof of customer data—only a deterministic split from bundled demos.

**Quick rollup → `terminal_status`:** [`src/commercial/quickVerifyFunnelTerminalStatus.ts`](../src/commercial/quickVerifyFunnelTerminalStatus.ts): `pass` → `complete`, `fail` → `inconsistent`, `uncertain` → `incomplete`.

**Privacy:** No file contents or connection strings are logged—only enums, `run_id` for activation rows (in `metadata` and dedupe receipts), **`install_id`** as a nullable column on **`funnel_event`** (pseudonymous CLI install), `funnel_anon_id` for optional browser correlation, `run_id` correlation via `usage_reservation` for licensed completion, classified path buckets, and bounded attribution strings from the surface beacon.

---

## Validation (release gate)

From the repository root, **`npm run validate-commercial`** must pass (includes website Vitest with DB migrations applied). That is the binary gate for this SSOT’s implementation staying green.

**Manual smoke:** run a local OSS `verify` or `quick` against a deployment with core + telemetry migrations applied, **`TELEMETRY_DATABASE_URL`** set, **`AGENTSKEPTIC_TELEMETRY` unset**, and confirm one `verify_started` and one `verify_outcome` row appear for a single `run_id` in **telemetry** `funnel_event` (and matching rows in telemetry `product_activation_*_beacon`). With **`AGENTSKEPTIC_TELEMETRY=0`**, confirm **no** new rows for that run.

### Operator validation (`telemetry_source`, `AGENTSKEPTIC_RUN_ID`)

Use a **fresh** UUID for **`AGENTSKEPTIC_RUN_ID`** on every validation run (the CLI already prefers this env for activation `run_id` when set). After **`npm run build`**, run **`quick`** once per scenario against a reachable deployment, then prove rows with SQL filtered on **`metadata->>'run_id' = '<that literal>'`** (not recency heuristics). Example control command and expected outcomes for **`local_dev`**, default **`unknown`**, and **`AGENTSKEPTIC_TELEMETRY=0`** are specified in the repository’s telemetry plan (operator runbook); this SSOT does not assert exclusivity against other clients reusing the same UUID—operators must mint a new id per run.

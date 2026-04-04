# Execution Truth Layer (MVP) — Single Source of Truth

This document is the authoritative specification for the MVP. The product verifies **external SQL state** against expectations derived from **observed tool calls** and a **tool registry**, never from agent-reported success alone.

## Why this shape

- **NDJSON events**: One line per tool invocation provides a concrete “observe each step” capture surface that any agent stack can implement by appending JSON after each tool call.
- **Tool registry (`tools.json`)**: Keeps “intent → expected state” inside the product using RFC 6901 JSON Pointers into `params`, so events do not carry caller-supplied expectation blobs.
- **SQLite via `node:sqlite`**: Read-only `SELECT` against a file path gives reproducible ground truth in CI. The reference plan named `better-sqlite3`; this repo uses Node’s built-in module (**Node ≥ 22.13**) to avoid native compilation on constrained environments while preserving the same reconciliation rules as Postgres (see [SQL connector contract](#sql-connector-contract)).
- **Postgres via `pg` (batch/CLI only)**: `verifyWorkflow` can target PostgreSQL using a single `pg.Client` per run, session read-only guards (`applyPostgresVerificationSessionGuards`), then verification `SELECT`s only. The in-process hook does **not** use Postgres (see [Postgres verification (batch and CLI)](#postgres-verification-batch-and-cli)).

## Audiences

### Engineer

| Module | Role |
|--------|------|
| `schemaLoad.ts` | AJV 2020-12 validators for event line, execution trace view, registry, workflow engine/result, truth report, compare-input |
| `failureCatalog.ts` | Stable run-level literals, `formatOperationalMessage`, CLI error envelope helpers, `CLI_OPERATIONAL_CODES` |
| `truthLayerError.ts` | `TruthLayerError` for coded I/O and registry failures |
| `loadEvents.ts` | Read NDJSON, validate union event schema, filter `workflowId`; populate `runEvents` (capture order) and tool-only `events` via `prepareWorkflowEvents` + `eventSequenceIntegrity` |
| `prepareWorkflowEvents.ts` | Sole ingest `stableSortEventsBySeq`; attaches `eventSequenceIntegrity` |
| `eventSequenceIntegrity.ts` | Pure analysis of capture order vs `seq` and optional `timestamp` monotonicity (seq-sorted order) |
| `planLogicalSteps.ts` | Stable sort, group by `seq`, canonical params equality, divergence vs last observation |
| `resolveExpectation.ts` | Registry + params → `VerificationRequest`; `intendedEffect` template rendering (audit only) |
| `valueVerification.ts` | Canonical display strings + `verificationScalarsEqual` (single scalar comparison table) |
| `sqlConnector.ts` | SQLite parameterized read; lowercase column keys |
| `sqlReadBackend.ts` | `buildSelectByKeySql`, Postgres `SqlReadBackend`, `connectPostgresVerificationClient`, `applyPostgresVerificationSessionGuards` |
| `reconciler.ts` | `reconcileFromRows` (pure rule table), `reconcileSqlRow` (SQLite sync), `reconcileSqlRowAsync` (Postgres) |
| `multiEffectRollup.ts` | `rollupMultiEffectsSync` / `rollupMultiEffectsAsync`: per-effect reconcile, UTF-16 sort by effect `id`, step rollup (`verified` / `partially_verified` / `inconsistent` / `incomplete_verification`) |
| `aggregate.ts` | Workflow status precedence |
| `actionableFailure.ts` | Actionable failure **`category`** / **`severity`** (workflow + operational), compare **`categoryHistogram`** / **`actionableCategoryRecurrence`**, P-CAT-1–4 and workflow S-1–S4; **`productionStepReasonCodeToActionableCategory`** + operational severity table |
| `verificationDiagnostics.ts` | Pinned step `failureDiagnostic`; `formatVerificationTargetSummary`; run/event-sequence `category:` helpers for human report (internal; not re-exported from package entry) |
| `workflowTruthReport.ts` | `buildWorkflowTruthReport`, `finalizeEmittedWorkflowResult`, `formatWorkflowTruthReportStruct`, `formatWorkflowTruthReport`, `HUMAN_REPORT_RESULT_PHRASE`, `STEP_STATUS_TRUTH_LABELS`, `TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX`; human report text is rendering of structured truth with plain `result=` / `detail:` lines |
| `workflowResultNormalize.ts` | `normalizeToEmittedWorkflowResult`, `workflowEngineResultFromEmitted` (compare legacy engine v5 / result v6; inject empty **`verificationRunContext`**) |
| `runComparison.ts` | `buildRunComparisonReport`, `formatRunComparisonReport`, `logicalStepKeyFromStep`, `recurrenceSignature`; cross-run comparison |
| `verificationPolicy.ts` | `VerificationPolicy` normalization/validation; `executeVerificationWithPolicySync` / `executeVerificationWithPolicyAsync` (strong vs eventual polling); `createSqlitePolicyContext` |
| `executionTrace.ts` | `assertValidRunEventParentGraph`, `buildExecutionTraceView`, `formatExecutionTraceText`; `traceStepKind` derivation and `backwardPaths` |
| `pipeline.ts` | Orchestration: `runLogicalStepsVerification` (internal), async `verifyWorkflow`, sync `verifyToolObservedStep`, `withWorkflowVerification` (SQLite `dbPath` only); default `truthReport` / `logStep` |
| `cli.ts` | CLI entry: verify + `compare` + `execution-trace` + `validate-registry` + **`debug`** subcommands |
| `debugCorpus.ts` | Debug Console corpus layout: enumerate `<corpusRoot>/<runId>/`, load outcomes (**`ok`** / **`error`**), path safety, optional **`meta.json`** |
| `debugFocus.ts` | Pure **`buildFocusTargets`**: maps **`workflowTruthReport.failureAnalysis.evidence`** to trace navigation targets (tested golden vectors) |
| `debugPatterns.ts` | **`buildCorpusPatterns`**: histograms + **`recurrenceSignature`** aggregation; optional pairwise recurrence when **`workflowId`** filter set (cap **50** runs) |
| `debugRunFilters.ts` | Server-side **`GET /api/runs`** query parsing, pagination cursor, **`includeLoadErrors`** default **true** |
| `debugRunIndex.ts` | **`RunListItem`** facets for filters; customer sentinel **`__unspecified__`** when **`meta.json`** omits **`customerId`** |
| `debugServer.ts` | Local HTTP on **127.0.0.1** only: JSON APIs + static **`debug-ui/`** (copied to **`dist/debug-ui/`** on build) |

### Engineer note: shared step core

`reconcileFromRows` in `reconciler.ts` is the single rule table. `planLogicalSteps` collapses multiple observations per `seq`; `verifyToolObservedStep` (SQLite, sync) reconciles the **last** observation per logical step when observations are non-divergent. `verifyWorkflow` and `withWorkflowVerification` both call the same internal `runLogicalStepsVerification` once per run (SQLite sync / Postgres async). **Why:** One classification table; one logical step per `seq`; SQLite stays synchronous at the integrator boundary; Postgres stays on the batch path only.

### Low-friction integration (in-process)

Primary integration for running workflows in code: **`await withWorkflowVerification(options, run)`** from `pipeline.ts` (re-exported in the package entry). The `run` callback receives **`observeStep`**; call it after each tool with one [event line](#event-line-schema) object. There is **no** public `finish` — after `run` completes successfully, the library builds the **`WorkflowResult`** (including SQL verification) **before** closing the read-only SQLite handle in **`finally`**.

**`withWorkflowVerification` is SQLite-only** (option `dbPath` → read-only file) and supports **`consistencyMode: "strong"` only**. Eventual consistency polling requires the batch/async path: use **`await verifyWorkflow`** (or CLI) with `verificationPolicy.consistencyMode: "eventual"`. Passing eventual policy to `withWorkflowVerification` fails before the user `run` with operational code **`EVENTUAL_MODE_NOT_SUPPORTED_IN_PROCESS_HOOK`**. For Postgres ground truth, replay NDJSON and call **`await verifyWorkflow`** with `database: { kind: "postgres", connectionString }` or use the CLI (`--postgres-url`). **Why:** Keeps `observeStep` synchronous and a single stable hook; async `pg` and polling are isolated to batch verification.

One root boundary; library owns DB close in finally; avoids silent leaks when integrators omit a terminal call.

Normative contracts:

- **`observeStep` input:** Only a JavaScript **non-null object** is schema-validated against the event schema; **strings and primitives are not parsed as NDJSON**—non-objects yield **`MALFORMED_EVENT_LINE`** (same run-level meaning as a bad NDJSON line in batch mode).
- **`observeStep` return:** Always **`undefined`**. The authoritative step list and statuses are **only** on the fulfilled **`WorkflowResult`** from **`withWorkflowVerification`**.
- **`withWorkflowVerification` return:** **`Promise<WorkflowResult>`** fulfilled on success; **rejected** on invalid registry/DB setup (before `run`) or if **`run`** throws or rejects — the DB is closed in **`finally`** after the result is built (or after throw).
- **Post-close `observeStep`:** If a caller keeps the injected function and uses it after the run, it throws **`Error`** with message **`Workflow verification observeStep invoked after workflow run completed`**.
- **Parity:** Feeding the same event objects in file order as an NDJSON workflow must match **`await verifyWorkflow`** on that file for the same `workflowId`, `registryPath`, and SQLite `database: { kind: "sqlite", path }` (same file path as `dbPath` for the hook).

**Defaults (`truthReport` / `logStep`):** **`withWorkflowVerification`** uses the same defaults as **`verifyWorkflow`**: **`truthReport`** writes the canonical human report (see [Human truth report](#human-truth-report)) to **stderr** once when the `WorkflowResult` is ready; **`logStep`** default is a **no-op** (no per-step stderr JSON). Override with `truthReport: () => {}` in tests. **Migration:** if you depended on previous default per-step JSON on stderr, pass an explicit `logStep`, e.g. `(obj) => console.error(JSON.stringify(obj))`. For custom UIs while keeping canonical copy: `import { formatWorkflowTruthReport } from '<package>'`. **Migration:** `verifyWorkflow` is **async** and takes **`database`** instead of `dbPath`; use `database: { kind: "sqlite", path }` for file-backed batch verification.

### Postgres verification (batch and CLI)

- **Library:** `await verifyWorkflow({ workflowId, eventsPath, registryPath, database: { kind: "postgres", connectionString }, … })`. One **`pg.Client`** per invocation: `connect()` → **`applyPostgresVerificationSessionGuards`** (runs **`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`**) → **`SELECT 1`** on that client → per-step parameterized verification `SELECT`s → `client.end()` in `finally` (cleanup errors must not mask the primary failure).
- **CLI:** Exactly one of `--db <sqlitePath>` or **`--postgres-url <url>`**. Connection, guard, or I/O failure before a verdict: the CLI prints **one line** of JSON to **stderr** (see [CLI operational errors](#cli-operational-errors)) and exits **3** with **no** workflow JSON on stdout.
- **Safety evidence in CI:** Tests assert (1) after session guards, **`INSERT` into `readonly_probe`** fails with **read-only transaction** (`25006`), and (2) role **`verifier_ro`** has **SELECT only** on verification tables (`INSERT` denied `42501`). Operators should still use a **least-privilege DB user** and TLS (`sslmode` in the URL) in real environments.

### Batch and CLI (replay)

For CI, audits, or logs written as NDJSON:

1. To verify your checkout with bundled `examples/` artifacts, run `npm run first-run` from the repository root (see [Examples](#examples)). It builds the project, creates `examples/demo.db` from `seed.sql`, and runs two sample workflows.
2. After **each** tool call, append one JSON object line to your NDJSON file (see [Event line schema](#event-line-schema)).
3. Maintain `tools.json` with one entry per `toolId` your workflows emit.
4. Optionally validate the registry (and optionally resolution vs NDJSON) without a database: `node dist/cli.js validate-registry --registry <path>` or with `--events` and `--workflow-id` (see [Registry validation (`validate-registry`) — normative](#registry-validation-validate-registry--normative)).
5. Run:

```bash
npm run build
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --db <sqlitePath>
# or
node dist/cli.js --workflow-id <id> --events <path> --registry <path> --postgres-url <postgresql-url>
```

**Why:** Same event contract for CI and external logs without requiring in-process wrapper.

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | `workflow.status` is `complete` |
| 1 | `workflow.status` is `inconsistent` |
| 2 | `workflow.status` is `incomplete` |
| 3 | Operational failure (registry read/parse, events read, DB open/connect, invalid args, internal CLI error); see [CLI operational errors](#cli-operational-errors) |

**`--help` / `-h`:** Prints usage to **stdout** and exits **0** (not a verification run).

**I/O order (CLI — verdict paths 0/1/2):** **`verifyWorkflow`** emits the human report via default **`truthReport`** to **stderr** first, then the CLI writes **stdout**. So: **stderr (human) → stdout (JSON)**. If the CLI is invoked with **`--no-truth-report`**, the CLI passes a no-op **`truthReport`** into **`verifyWorkflow`**: for exits **0–2**, **stderr** is **empty** (no human report); **stdout** is unchanged (still one **`WorkflowResult`** JSON line). Exit **3** is unchanged (see [CLI operational errors](#cli-operational-errors)).

**stdout:** Single JSON object matching `schemas/workflow-result.schema.json` (`schemaVersion` **`8`**; required **`verificationRunContext`** digest; required **`workflowTruthReport`** subtree validated by [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) — **SSOT** for structured truth JSON, including required **`failureAnalysis`** (`null` when complete, object when not — see [Actionable failure classification](#actionable-failure-classification-normative)); required **`verificationPolicy`** `{ consistencyMode, verificationWindowMs, pollIntervalMs }`; required **`eventSequenceIntegrity`**; includes required **`runLevelReasons`** alongside **`runLevelCodes`**; each step includes **`repeatObservationCount`** and **`evaluatedObservationOrdinal`**; each non-**`verified`** step includes required **`failureDiagnostic`** — see [Verification diagnostics](#verification-diagnostics-normative)). The aggregated engine shape before finalization is `schemas/workflow-engine-result.schema.json` (`schemaVersion` **6**); see [Structured workflow truth report](#structured-workflow-truth-report-normative) and [Failure analysis](#failure-analysis-normative).

**Verification policy (CLI):** Default is **`strong`** (single read per check). For **`eventual`**, pass **`--consistency eventual`** plus required **`--verification-window-ms`** and **`--poll-interval-ms`** (integers ≥ 1, **`pollIntervalMs` ≤ `verificationWindowMs`**). With **`strong`**, do not pass the millisecond flags. See [Verification policy (normative)](#verification-policy-normative).

**stderr (verdict paths):** Unless **`--no-truth-report`** is set, one **human truth report** per verification (same text as `formatWorkflowTruthReport`); see [Human truth report](#human-truth-report).

### CI workflow truth contract (Postgres CLI)

This subsection is **normative** for CI and for any automation that treats **`verify-workflow`** as the sole machine-facing verification surface. The **only** structured artifacts for workflow truth from the CLI are:

- **Exits 0–2:** one JSON object on **stdout** matching **`schemas/workflow-result.schema.json`** (see **stdout** above).
- **Exit 3:** **stdout** empty; **stderr** exactly one JSON line with **`kind`:** **`execution_truth_layer_error`** (see [CLI operational errors](#cli-operational-errors)).

There is **no** separate CI-only report format. Integrators should parse **stdout** for verdicts **0–2** and **stderr** for exit **3**, not the human truth report text.

**Environment:** **`POSTGRES_VERIFICATION_URL`** must be set to a **`verifier_ro`**-capable URL after **`scripts/pg-ci-init.mjs`** (or equivalent) has created roles and seeded tables. **`examples/events.ndjson`** and **`examples/tools.json`** are the event and registry paths.

**`--no-truth-report`:** For the cases below that verify exits **0** and **1**, the CLI **must** be invoked with **`--no-truth-report`** so **stderr** is **empty** and automation does not need to skip human lines.

**Case 1 — Postgres happy path (exit 0)**

| Observable | Required |
|------------|----------|
| argv | `--workflow-id wf_complete --events <examples/events.ndjson> --registry <examples/tools.json> --postgres-url <POSTGRES_VERIFICATION_URL> --no-truth-report` |
| Exit code | **0** |
| **stdout** | One line; valid **`WorkflowResult`**; **`schemaVersion`** **8**; required **`verificationRunContext`**; required **`workflowTruthReport`** with **`failureAnalysis`** **`null`**; **`workflowId`** **`wf_complete`**; **`status`** **`complete`**; first step **`status`** **`verified`**; **`runLevelReasons`** **`[]`**; **`runLevelCodes`** **`[]`** |
| **stderr** | Empty |

**Case 2 — Postgres determinate failure (exit 1)**

| Observable | Required |
|------------|----------|
| argv | Same as case 1 with **`--workflow-id wf_missing`** |
| Exit code | **1** |
| **stdout** | One line; valid **`WorkflowResult`**; **`workflowId`** **`wf_missing`**; **`status`** **`inconsistent`**; first step **`status`** **`missing`**; first step first reason **`code`** **`ROW_ABSENT`** |
| **stderr** | Empty |

**Case 3 — Operational failure before verification (exit 3)**

| Observable | Required |
|------------|----------|
| argv | **`--workflow-id wf_complete`** only (omit **`--events`**, **`--registry`**, **`--db`**, **`--postgres-url`**) |
| Exit code | **3** |
| **stdout** | Empty |
| **stderr** | One line; JSON with **`schemaVersion`** **2**, **`kind`** **`execution_truth_layer_error`**, **`code`** **`CLI_USAGE`**, **`message`** non-empty string length ≤ **2048**, required **`failureDiagnosis`** (`summary`, **`primaryOrigin`**, **`confidence`**, **`evidence`**, **`actionableFailure`**) — see [`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json) |

**Enforcement:** **`test/ci-workflow-truth-postgres-contract.test.mjs`** implements these three cases; **`npm run test:workflow-truth-contract`** runs that file alone. **`npm run test:ci`** runs the full CI suite (build, Vitest, SQLite `node:test` files, **`npm run test:postgres`** which runs **`scripts/pg-ci-init.mjs`** then all Postgres-backed `node:test` files including this contract, then **`scripts/first-run.mjs`**). GitHub Actions runs **`npm run test:ci`** after **`npm ci`**.

### CLI operational errors

When the CLI exits **3**, **stderr** is exactly **one** UTF-8 line: a JSON object with:

- `schemaVersion`: **2**
- `kind`: **`execution_truth_layer_error`**
- `code`: one of **`CLI_USAGE`**, **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`REGISTRY_SCHEMA_INVALID`**, **`REGISTRY_DUPLICATE_TOOL_ID`**, **`EVENTS_READ_FAILED`**, **`SQLITE_DATABASE_OPEN_FAILED`**, **`POSTGRES_CLIENT_SETUP_FAILED`**, **`WORKFLOW_RESULT_SCHEMA_INVALID`**, **`VERIFICATION_POLICY_INVALID`**, **`VALIDATE_REGISTRY_USAGE`**, **`INTERNAL_ERROR`**, plus compare-subcommand codes (**`COMPARE_USAGE`**, **`COMPARE_INPUT_READ_FAILED`**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**, …) as documented under [Cross-run comparison](#cross-run-comparison-normative), plus **`execution-trace`** codes (**`EXECUTION_TRACE_USAGE`**, **`TRACE_DUPLICATE_RUN_EVENT_ID`**, **`TRACE_UNKNOWN_PARENT_RUN_EVENT_ID`**, **`TRACE_PARENT_FORWARD_REFERENCE`**, …)
- `message`: human-readable text after whitespace normalization and truncation (max **2048** JavaScript string length; see `formatOperationalMessage` in `failureCatalog.ts`)
- `failureDiagnosis`: structured operational diagnosis (**`summary`**, **`primaryOrigin`**, **`confidence`**, **`evidence`** with **`referenceCode`**, **`actionableFailure`**) from `operationalFailureDiagnosis.ts`, using origin mappings in **`failureOriginCatalog.ts`** and category/severity in **`actionableFailure.ts`** (see [Actionable failure classification](#actionable-failure-classification-normative))

**stdout** must be empty on exit **3**. Automation should key on **`code`**, not exact **`message`**, for driver-dependent errors.

### Human truth report

This section is **normative**: literals and line shape match `formatWorkflowTruthReportStruct` applied to `buildWorkflowTruthReport(engine)` in `workflowTruthReport.ts` and the contract tests.

**Why this shape**

- **Structured SSOT, one human rendering:** The canonical machine shape is **`workflowTruthReport`** on emitted **`WorkflowResult`** (see [Structured workflow truth report](#structured-workflow-truth-report-normative)). CLI, `verifyWorkflow`, and `withWorkflowVerification` write the human report via optional **`truthReport?: (report: string) => void`**; the default appends one newline after the string to **stderr** (`process.stderr.write`). Same text surfaces—no parallel logic.
- **stderr human / stdout JSON:** Automation keeps a single JSON record on stdout (`jq`, pipes); operators read the verdict on stderr. The CLI flag **`--no-truth-report`** yields empty stderr on verdict exits **0–2** so logs and parsers need not skip the human report (see [Batch and CLI (replay)](#batch-and-cli-replay)).
- **Default `truthReport` to stderr:** Gives a clear truth signal without extra configuration; silent tests pass `truthReport: () => {}`.
- **Default `logStep` no-op:** Removes the old default of one JSON object per step on stderr, which duplicated `WorkflowResult` and conflicted with the human report.
- **Fixed `trust:` lines:** Most `trust:` lines map to one `WorkflowStatus` from `aggregate.ts`, except the **eventual-window uncertainty** line which applies when `workflow_status` is `incomplete` under the narrow rule in the grammar below.
- **Machine-stable JSON labels (`STEP_STATUS_TRUTH_LABELS`):** The structured **`workflowTruthReport`** on stdout JSON uses fixed **`outcomeLabel`** strings (`VERIFIED`, `FAILED_ROW_MISSING`, …) for integrators and **`verify-workflow compare`**. The **human report text** uses plain-language **`result=`** phrases from **`HUMAN_REPORT_RESULT_PHRASE`** in `workflowTruthReport.ts` (same mapping table as JSON labels—see [Human text vs JSON `outcomeLabel`](#human-text-vs-json-outcomelabel) below). **Automation should key on stdout JSON**, not on parsing stderr text.
- **Run-level and event-sequence issues:** Human text leads with **`detail:`** (trimmed `message`), then **`category:`**, then **`reference_code:`** (wire `code`). Same sources as **`runLevelReasons`** / **`eventSequenceIntegrity.reasons`**.
- **Failure diagnosis:** When the workflow is not **`complete`**, after **`trust:`** the human report includes a **`diagnosis:`** block mirroring **`workflowTruthReport.failureAnalysis`** on stdout JSON (see [Failure analysis](#failure-analysis-normative)), including one line **`actionable_failure: category=… severity=…`** (see [Actionable failure classification](#actionable-failure-classification-normative)).
- **No trailing newline inside the returned string:** The default `truthReport` implementation appends `\n` when writing to stderr.

### Structured workflow truth report (normative)

- **SSOT for JSON shape:** [`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json) (`$id` in file). Integrators and tools should treat that schema as the authoritative contract for **`workflowTruthReport`**; this document describes purpose and integration only (no duplicate field tables here).
- **Embedding:** On stdout / public API, **`workflowTruthReport`** is required on **`WorkflowResult`** with outer **`schemaVersion` 8** ([`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)); inner **`workflowTruthReport.schemaVersion`** is **3**.
- **Construction:** `buildWorkflowTruthReport(engine)` derives the object from **`WorkflowEngineResult`** (`schemaVersion` 6, [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json)) produced by `aggregateWorkflow` plus **`verificationRunContext`** merged in `verifyWorkflow` / `withWorkflowVerification`. `finalizeEmittedWorkflowResult` attaches the truth report and sets **`WorkflowResult.schemaVersion` 8**.
- **Evolution:** Additive changes to the truth report require bumping **`workflowTruthReport.schemaVersion`** inside the truth schema; breaking engine/stdout shape bumps **`WorkflowResult.schemaVersion`**; document changes in this file’s compatibility section.

### Failure analysis (normative)

**Purpose:** Deterministic root-cause hints for failed runs (human + machine) without LLMs.

- **`verificationRunContext`:** Required on **`WorkflowEngineResult`** / **`WorkflowResult`**. Built from filtered **`runEvents`** in file order by **`buildVerificationRunContext`** (`verificationRunContext.ts`). Includes **`retrievalEvents`**, **`controlEvents`**, **`modelTurnEvents`**, **`toolSkippedEvents`**, and **`toolObservedIngestIndexBySeq`** (last ingest index per **`tool_observed`** `seq`). v1-only event files yield an empty digest except **`toolObservedIngestIndexBySeq`**.
- **`failureAnalysis`:** Required on **`workflowTruthReport`**: JSON **`null`** when **`workflowStatus`** is **`complete`**; otherwise a structured object from **`buildFailureAnalysis`** (`failureAnalysis.ts`) with **`summary`**, **`primaryOrigin`** (`decision_making` \| `inputs` \| `retrieval` \| `tool_use` \| `workflow_flow` \| `downstream_system_state`), **`confidence`**, **`unknownReasonCodes`** (sorted unique; SSOT maps in **`failureOriginCatalog.ts`**), **`evidence[]`**, optional **`alternativeHypotheses`** (fixed for **`ROW_ABSENT`** and **`VALUE_MISMATCH`**), and required **`actionableFailure`** (`actionableFailure.ts`; see [Actionable failure classification](#actionable-failure-classification-normative)).
- **Precedence (normative):** **P0** run-level reasons → **P1** retrieval **`error`** before failing tool ingest → **P2** bad **`model_turn`** / **`interrupt`** / skipped **`branch`/`gate`** → **P3** **`tool_skipped`** → **P4** irregular **`eventSequenceIntegrity`** → **P5** step driver (status severity, then `seq`, then `toolId`), with **P5b** multi-effect rollup to the lexicographically smallest failing effect **`id`**.
- **SSOT for code → origin:** **`failureOriginCatalog.ts`** (operational + step + run-level + event-sequence maps). **`failureOriginTypes.ts`** defines the **`FailureOrigin`** literals; JSON Schema enums must match (**`failureOriginSchemaParity.test.ts`**). This document does **not** duplicate the full code table.

**Compare / normalize:** Saved **`WorkflowEngineResult`** with **`schemaVersion` 5** is upgraded with an empty **`verificationRunContext`**. Saved **`WorkflowResult`** with **`workflowTruthReport.schemaVersion` 1–2** is upgraded by recomputing truth (no deep equality check on the embedded truth subtree). For **`workflowTruthReport.schemaVersion` ≥ **3**, **`normalizeToEmittedWorkflowResult`** requires recomputed truth to match the file (**`COMPARE_WORKFLOW_TRUTH_MISMATCH`** on mismatch).

### Actionable failure classification (normative)

**Purpose:** Deterministic **triage** categories for product and engineering (frequency, severity, recurrence) alongside existing **`primaryOrigin`** and step **`failureDiagnostic`** (those stay orthogonal).

**Normative sources (only two):**

1. JSON Schema enums: **`actionableFailure.category`** and **`actionableFailure.severity`** on **`workflowTruthReport.failureAnalysis`** ([`schemas/workflow-truth-report.schema.json`](../schemas/workflow-truth-report.schema.json)), the same category/severity on CLI **`failureDiagnosis.actionableFailure`** ([`schemas/cli-error-envelope.schema.json`](../schemas/cli-error-envelope.schema.json)), and compare report fields **`perRunActionableFailures`**, **`categoryHistogram`**, **`actionableCategoryRecurrence`** ([`schemas/run-comparison-report.schema.json`](../schemas/run-comparison-report.schema.json); report **`schemaVersion` 2**).
2. Implementation **`actionableFailure.ts`**: P-CAT-1–4 precedence, workflow severity S-1–S4, **`OPERATIONAL_CODE_TO_SEVERITY`**, and step-code partition consumed by **`productionStepReasonCodeToActionableCategory`** (exhaustiveness over **`PRODUCTION_STEP_REASON_CODES`** is tested in **`actionableFailure.partitionExhaustive.test.ts`**).

**Non-normative:** Prose in this section beyond the two bullets above is explanatory; it must not introduce a third mapping authority.

**Workflow categories:** Eight literals: **`decision_error`**, **`bad_input`**, **`retrieval_failure`**, **`control_flow_problem`**, **`state_inconsistency`**, **`downstream_execution_failure`**, **`ambiguous`**, **`unclassified`**. Compare also emits synthetic **`complete`** (with severity **`low`**) per run when **`failureAnalysis`** is **`null`**, for histograms that sum to the run count.

**Cross-run comparison:** **`runIndex`** order in **`verify-workflow compare`** inputs is the normative time axis for **`actionableCategoryRecurrence`** (longest consecutive **`runIndex`** block per category). Integrators may map indices to wall-clock externally.

## Verification diagnostics (normative)

**Why:** Operators need a stable three-way distinction (workflow execution vs verification setup vs observation uncertainty) without parsing free-text `reason` lines alone.

**JSON (`WorkflowResult.steps[]`):** For each step with **`status !== "verified"`**, **`failureDiagnostic`** is **required** and is one of:

| Value | Meaning |
|-------|--------|
| `workflow_execution` | Determinate mismatch against readable DB state, divergent retries for the same `seq`, or partial multi-effect failure. |
| `verification_setup` | Cannot reliably run or interpret the check (registry resolution, unknown tool in registry, connector errors, row shape unreadable, multi-effect incomplete rollup). |
| `observation_uncertainty` | Eventual consistency: step status **`uncertain`**. |

**Verified steps** must **omit** **`failureDiagnostic`** (schema forbids the property).

**Classification** is implemented in **`verificationDiagnostics.ts`** (`failureDiagnosticForStep`): `incomplete_verification` reasons are mapped in fixed precedence (e.g. **`RETRY_OBSERVATIONS_DIVERGE`** → `workflow_execution`; **`MULTI_EFFECT_INCOMPLETE`** → `verification_setup`; registry/resolve and reconciler incomplete codes → `verification_setup`).

**Human report (`category:`):** After each run-level **`detail:`** block and each irregular `event_sequence` **`detail:`** block, one line `    category: ` + the same string as above (`workflow_execution` for all current SSOT run-level and event-sequence codes). For each step with **`status !== "verified"`**, after **`observations:`**, one line `    category: ` + that step’s **`failureDiagnostic`**. When **`formatVerificationTargetSummary`** returns non-null, the next line is `    verify_target: ` + that one-line summary (table/key and required field names; truncated like operational messages).

**Migration from schema v4/v5/v6/v7:** Bump consumers to **`WorkflowResult.schemaVersion` 8** and **`workflowTruthReport.schemaVersion` 3**; read **`verificationRunContext`**, **`failureAnalysis`** (including **`unknownReasonCodes`** and **`actionableFailure`** when non-null), required **`workflowTruthReport`** for stable step labels and trust summary; for each step, if **`status !== "verified"`**, read **`failureDiagnostic`**. Saved **`schemaVersion` 5** engine JSON remains valid **`verify-workflow compare`** input (normalized in memory). Legacy **`WorkflowResult`** without **`verificationRunContext`** is normalized with an empty digest.

**Grammar (UTF-8; lines separated by `\n` only; returned string has no trailing `\n`)**

1. **Header — exactly three lines**
   - `workflow_id: ` + workflow id (defensive: replace `\r`/`\n` in the id with `_`).
   - `workflow_status: ` + exactly `complete`, `incomplete`, or `inconsistent`.
   - `trust: ` + exactly one of:
     - `TRUSTED: Every step matched the database under the configured verification rules.` when status is `complete`.
     - `NOT TRUSTED: Verification is incomplete; the workflow cannot be fully confirmed.` when status is `incomplete`, **except** when the narrower rule below applies.
     - `NOT TRUSTED: At least one step could not be confirmed within the verification window (row not observed; replication or processing delay is possible).` when status is `incomplete`, **`runLevelReasons` is empty**, at least one step has **`uncertain`**, and **no** step has status in **`{ missing, inconsistent, partially_verified, incomplete_verification }`**.
     - `NOT TRUSTED: At least one step failed verification against the database (determinate failure).` when status is `inconsistent`.
     - When **`eventSequenceIntegrity.kind`** is **`irregular`**, append **exactly** one ASCII space and this exact suffix to the trust sentence chosen above: `Event capture or timestamps were irregular; verification used seq-sorted order. See event_sequence below.` (same string as **`TRUST_LINE_EVENT_SEQUENCE_IRREGULAR_SUFFIX`** in `workflowTruthReport.ts`).

2. **Run-level**
   - If `runLevelReasons` is empty: line exactly `run_level: (none)`.
   - Otherwise: line `run_level:` then for each entry in **`runLevelReasons`** order: line `  - detail: ` + `reason.message` (trimmed), or `(no message)` if empty after trim; then line `    category: ` + category from `failureDiagnosticForRunLevelCode(reason.code)`; then line `    reference_code: ` + `reason.code`.
   - `runLevelCodes[i]` always equals `runLevelReasons[i].code` (derived from `runLevelReasons` at aggregation). When there are no matching events for the workflow id, the library appends **`NO_STEPS_FOR_WORKFLOW`** with message `No tool_observed events for this workflow id after filtering.`
   - Catalog literal for **`MALFORMED_EVENT_LINE`**: `Event line was missing, invalid JSON, or failed schema validation for a tool observation.`

3. **Event sequence integrity**
   - Immediately after the **run-level** block: if **`eventSequenceIntegrity.kind`** is **`normal`**, line exactly `event_sequence: normal`.
   - If **`kind`** is **`irregular`**: line `event_sequence: irregular`, then for each entry in **`eventSequenceIntegrity.reasons`** in array order: line `  - detail: ` + `reason.message` (trimmed), or `(no message)` if empty after trim; then line `    category: ` + `workflow_execution`; then line `    reference_code: ` + `reason.code`.
   - **Codes and messages** for these reasons are defined in **`EVENT_SEQUENCE_MESSAGES`** and **`eventSequenceTimestampNotMonotonicReason`** in `failureCatalog.ts` (SSOT for wire `message` strings).

4. **Steps**
   - Line exactly `steps:`.
   - For each step in array order: one line `  - seq=` + decimal seq + ` tool=` + toolId + ` result=` + plain phrase, where the phrase is **`HUMAN_REPORT_RESULT_PHRASE[outcomeLabel]`** in `workflowTruthReport.ts` and **`outcomeLabel`** is from **`STEP_STATUS_TRUTH_LABELS`** for that step status (defensive: `\r`/`\n` in toolId → `_`). Status → JSON **`outcomeLabel`** (and thus human **`result=`**) mapping:

| Step status | JSON `outcomeLabel` | Human `result=` phrase (exact strings in `HUMAN_REPORT_RESULT_PHRASE`) |
|-------------|---------------------|------------------------------------------------------------------------|
| `verified` | `VERIFIED` | `Matched the database.` |
| `missing` | `FAILED_ROW_MISSING` | `Expected row is missing from the database (the log implies a write that is not present).` |
| `inconsistent` | `FAILED_VALUE_MISMATCH` | `A row was found, but required values do not match.` |
| `incomplete_verification` | `INCOMPLETE_CANNOT_VERIFY` | `This step could not be fully verified (registry, connector, or data shape issue).` |
| `partially_verified` | `PARTIALLY_VERIFIED` | `Some intended database effects matched; others did not.` |
| `uncertain` | `UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW` | `The expected row did not appear within the verification window.` |

   - Immediately after that header line: exactly one line `    observations: evaluated=` + decimal `evaluatedObservationOrdinal` + ` of ` + decimal `repeatObservationCount` + ` in_capture_order` (four spaces before `observations:`; no trailing spaces; no period).
   - If **`status !== "verified"`**: next line `    category: ` + that step’s **`failureDiagnostic`** (must match JSON). If a non-null verification target summary is defined for the step’s **`verificationRequest`**, the following line is `    verify_target: ` + that summary; otherwise no `verify_target:` line.
   - For each step-level reason: line `    detail: ` + trimmed message, or `(no message)` if empty after trim; if `field` is set and non-empty, append ` field=` + field value to the same line; then line `    reference_code: ` + code.
   - If `intendedEffect` is non-empty after trim: `    intended: ` + single-line text (each `\r`/`\n` replaced by ASCII space, runs of spaces collapsed, trimmed).
   - **Multi-effect steps:** when `evidenceSummary.effects` is present (see [Workflow result: multi-effect shape](#workflow-result-multi-effect-shape)), after `intended:` (if any), emit one line per effect in **UTF-16 lexicographic order of effect `id`** (same comparator as `canonicalJsonForParams` object keys): `    effect: id=` + id + ` result=` + phrase from **`HUMAN_REPORT_EFFECT_RESULT_PHRASE`** (same mapping as the table above for effect-level statuses; **`partially_verified`** does not appear at the effect level). For each effect reason: line `      detail: ` + message (same rules as step-level), then `      reference_code: ` + code (six spaces before `detail:` and `reference_code:`).

**Engineer note:** Any change to fixed sentences or phrases requires updating golden tests and `test/docs-contract.test.mjs` pins.

#### Human text vs JSON `outcomeLabel`

| Human report `result=` (prefix) | JSON `workflowTruthReport.steps[].outcomeLabel` | Typical `WorkflowResult.steps[].status` |
|---------------------------------|-------------------------------------------------|----------------------------------------|
| `Matched the database.` | `VERIFIED` | `verified` |
| `Expected row is missing from the database` … | `FAILED_ROW_MISSING` | `missing` |
| `A row was found, but required values do not match.` | `FAILED_VALUE_MISMATCH` | `inconsistent` |
| `This step could not be fully verified` … | `INCOMPLETE_CANNOT_VERIFY` | `incomplete_verification` |
| `Some intended database effects matched` … | `PARTIALLY_VERIFIED` | `partially_verified` |
| `The expected row did not appear within the verification window.` | `UNCERTAIN_NOT_OBSERVED_WITHIN_WINDOW` | `uncertain` |

Step- and effect-level **`detail:`** / **`reference_code:`** pairs align with **`reasons[].message`** and **`reasons[].code`** on the same object in stdout JSON. **Alerts and automation** should prefer **`stdout` JSON** or structured **`workflowTruthReport`**, not regex on stderr, because human wording may evolve while JSON labels stay versioned. Older integrations that matched human lines containing **`status=`** must migrate to JSON fields or to **`result=`** / **`reference_code:`** lines.

### Operator

- **Reading logs:** Treat **stderr** as the human verdict for a verification run; **stdout** (CLI) is the machine-readable `WorkflowResult`. Correlate them by process / timestamp in your log stack.
- **`trust:` line:** Treat as **trusted** only when it is the `TRUSTED:` sentence **and** `workflow_status: complete`. Any line starting with `NOT TRUSTED:` means the workflow must not be treated as fully verified—investigate `steps:`, `run_level:`, and **`event_sequence:`**.
- **Exit codes:** 0 = `complete`, 1 = `inconsistent`, 2 = `incomplete`, 3 = operational failure ([CLI operational errors](#cli-operational-errors)); **`--help`** exits **0**.
- DB user should be **read-only** in production (Postgres: **SELECT-only** role; the product also sets **session read-only** via `applyPostgresVerificationSessionGuards`).
- **`npm test`** (default local validation) runs **`npm run build`**, **`npm run test:vitest`**, SQLite-only **`npm run test:node:sqlite`**, and **`scripts/first-run.mjs`** — **no** Postgres. **`npm run test:ci`** requires Postgres 16+ and env **`POSTGRES_ADMIN_URL`** (superuser, runs [`scripts/pg-ci-init.mjs`](../scripts/pg-ci-init.mjs) inside **`npm run test:postgres`**) and **`POSTGRES_VERIFICATION_URL`** (role `verifier_ro` / SELECT-only on seeded tables). CI sets both; locally use the README Docker one-liner and export the same URLs for **`npm run test:ci`**.
- SQLite file must exist when `readOnly: true` is used (Node `DatabaseSync`).
- Redact secrets from `params` before writing events if logs are retained; **redact params in retained logs** when those logs leave the trust boundary. The human report can include **`intended:`** text from the registry template—apply the same redaction policy if that text can contain secrets.

## Event capture order and delayed delivery (normative)

- **Capture order (batch):** Order of successfully parsed, schema-valid NDJSON lines for a given `workflowId` after filtering. Malformed lines do not produce events and do not consume a capture slot (they still emit **`MALFORMED_EVENT_LINE`** on `runLevelReasons`).
- **Capture order (in-process):** Order of **`observeStep`** calls that enqueue an event for the session `workflowId`.
- **Planning order:** Always **`stableSortEventsBySeq`** (stable by `seq`, ties by capture order). Only **`prepareWorkflowEvents.ts`** performs this sort on ingest; `planLogicalSteps` may sort again (idempotent).
- **`timestamp`:** Optional on events; **never** used to sort events or to choose the evaluated observation per `seq` (still the last observation in capture order within each `seq`).
- **Delayed / out-of-order (in scope):** Events may arrive with `seq` not non-decreasing in capture order, or late in wall time, as long as they are present **before** verification runs (**end of NDJSON read** or **`buildWorkflowResult`** after `run` completes). The product is deterministic: same multiset + capture order → same `WorkflowResult` except **`eventSequenceIntegrity`** per its rules.
- **Out of scope:** Events after **`buildWorkflowResult`** / closed session (**`observeStep`** throws); cross-invocation queuing; mid-run partial verification; SQL timing beyond **`VerificationPolicy`**.

Reason codes for **`eventSequenceIntegrity`** (wire **`message`** strings) are SSOT in **`failureCatalog.ts`** (`EVENT_SEQUENCE_MESSAGES`, **`eventSequenceTimestampNotMonotonicReason`**). JSON shape is SSOT in **`schemas/workflow-result.schema.json`**. Human report templates for **`event_sequence:`** and the irregular **`trust:`** suffix are SSOT in this section and **`workflowTruthReport.ts`**.

## Event line schema

File: [`schemas/event.schema.json`](../schemas/event.schema.json).

The file is a **`oneOf`** union:

- **`schemaVersion` `1`**, **`type` `tool_observed`**: legacy tool line (no `runEventId`). Same required fields as before: `workflowId`, `seq`, `toolId`, `params`.
- **`schemaVersion` `2`**: every branch requires `workflowId`, `runEventId` (non-empty string), and `type`. Optional `parentRunEventId` (non-empty string when present) must reference the **`runEventId` of a strictly earlier line** in the same workflow’s `runEvents` capture order (see [End-to-end execution visibility](#end-to-end-execution-visibility-normative)). **`v1` `tool_observed` lines do not have a wire `runEventId` and cannot be referenced as `parentRunEventId` targets**; use **`schemaVersion` `2` `tool_observed`** to link causality through a tool call.

**`type` values (v2):** `tool_observed` (also requires `seq`, `toolId`, `params`), `model_turn` (`status`: `completed` \| `error` \| `aborted` \| `incomplete`), `retrieval` (`source`, `status`: `ok` \| `empty` \| `error`), `control` (`controlKind`: `branch` \| `loop` \| `interrupt` \| `gate` \| `run_completed`; optional `label`; optional `decision`: `taken` \| `skipped` for branch/gate), `tool_skipped` (`toolId`, `reason`).

**SQL verification** consumes only **`type` `tool_observed`** lines (v1 or v2); other types are ignored for reconciliation but appear in **`runEvents`** and execution traces.

**Not allowed on the event:** `expectation` / `verification` objects — the resolver must derive verification from the registry.

**Optional summaries:** `model_turn.summary`, `retrieval.querySummary`, etc. may contain sensitive text; **redact** before retention outside the trust boundary (same policy as `params`).

### Retry and repeated seq

Multiple event lines with the same `workflowId` and **`seq`** are treated as **retries** of one logical step. **Capture order** is: after stable sort by `seq`, ties keep **file line order** (batch) or **`observeStep` call order** (session). The **last** observation in that order is the one reconciled against SQL when all observations in the group **match** the last on `toolId` and **canonical params** (see below). If any observation differs from the last, the step is **`incomplete_verification`** / **`RETRY_OBSERVATIONS_DIVERGE`** and **no** SQL reconcile runs for that step.

**`canonicalJsonForParams(value)`** (used only for divergence; implemented in `planLogicalSteps.ts`):

- `null`, `boolean`, `number`, or `string`: `JSON.stringify(value)` per ECMAScript.
- Array: `[` + elements each passed through `canonicalJsonForParams`, joined by `,` + `]` (no spaces).
- Plain object (`typeof === "object"`, not array, not null): own enumerable string keys sorted by UTF-16 code unit order with comparator `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`; `{` + for each key: `JSON.stringify(key)` + `:` + `canonicalJsonForParams(value[key])`, joined by `,` + `}` (no spaces).
- Any other value: sentinel `"__non_json_params:" + typeof value + "__"` (never equal to normal JSON-derived strings).

Two observations **match** iff `toolId` is `===` and `canonicalJsonForParams(params_a) === canonicalJsonForParams(params_b)`.

## End-to-end execution visibility (normative)

**Purpose:** Reconstruct the full capture-ordered execution path (model turns, retrieval, control, tool skipped, tool observed) and walk backward from the terminal event and from each verified step.

**Loader (`loadEventsForWorkflow`) — single ingest rule:** For each non-empty physical NDJSON line: if `JSON.parse` throws **or** the line fails the event union schema **or** (after parse) `workflowId` does not match the requested id → on parse/schema failure increment **`malformedEventLineCount`**, append **`MALFORMED_EVENT_LINE`** to **`runLevelReasons`**, and **do not** append to **`runEvents`** or the tool candidate list; on `workflowId` mismatch only, skip the line without counting malformed. Otherwise append to **`runEvents`** in encounter order, and if `type === "tool_observed"` also append to the tool candidate list. Then **`events`** = `prepareWorkflowEvents(toolCandidates).eventsSorted` (seq-sorted tools only); **`eventSequenceIntegrity`** is computed from those tool candidates only. **`runEvents`** is in **capture order** for the filtered workflow.

**`LoadEventsResult`:** **`events`** — tool observations only, sorted for verification (unchanged meaning for existing callers). **`runEvents`** — all valid union events for the workflow in capture order.

**Trace artifact:** [`schemas/execution-trace-view.schema.json`](../schemas/execution-trace-view.schema.json). TypeScript: `buildExecutionTraceView({ workflowId, runEvents, malformedEventLineCount, workflowResult? })` in **`executionTrace.ts`**. Output **`ExecutionTraceView`**: `schemaVersion` **1**, `workflowId`, `runCompletion` (`completed` iff the last node by capture order is `control` with `controlKind` **`run_completed`**; else `unknown_or_interrupted`), **`malformedEventLineCount`** (same integer as the loader), **`nodes[]`**, **`backwardPaths[]`**.

**`nodes[]`:** One node per `runEvents` entry. **`runEventId`**: wire `runEventId` for v2; for v1 `tool_observed`, synthetic **`syn:${ingestIndex}`** (display and path walking only — **never** valid on the wire as `parentRunEventId`). **`parentRunEventId`**: wire parent when valid; else `null`. **`traceStepKind`** is derived by first matching row in the table below (tool logical-step metadata from `planLogicalSteps` on the tool-only subsequence).

| Condition | `traceStepKind` |
|-----------|-----------------|
| `tool_skipped` | `skipped` |
| `control`, `branch` or `gate`, `decision` `taken` | `branch_taken` |
| `control`, `branch` or `gate`, `decision` `skipped` | `branch_skipped` |
| `model_turn`, `status` `error` | `failed` |
| `model_turn`, `status` `completed` | `success` |
| `model_turn`, `status` `aborted` or `incomplete` | `failed` |
| `retrieval`, `status` `error` | `failed` |
| `retrieval`, `status` `ok` | `success` |
| `retrieval`, `status` `empty` | `neutral` |
| `control`, `interrupt` | `failed` |
| `control`, `run_completed` | `success` |
| `control`, `loop` | `neutral` |
| `tool_observed`, logical step **divergent**, this line is **last** in capture order for that `seq` | `divergent_observations` |
| `tool_observed`, `repeatObservationCount > 1`, not last in capture order for that `seq` | `repeated_observation` |
| `tool_observed`, last for `seq`, `WorkflowResult` supplied, step **verified** | `success` |
| `tool_observed`, last for `seq`, `WorkflowResult` supplied, step not verified | `failed` |
| `tool_observed`, last for `seq`, no `WorkflowResult` | `neutral` |
| (else) | `neutral` |

**`verificationLink` on a node:** Set only on the **evaluated** `tool_observed` line for each `seq` (last in capture order among tools with that `seq`) when **`workflowResult`** was passed into `buildExecutionTraceView`; copies `stepIndex`, `seq`, `engineStepStatus` (`WorkflowResult.steps[i].status`), `truthOutcomeLabel` (`workflowTruthReport.steps[i].outcomeLabel`). Otherwise `null`.

**`backwardPaths`:** Always includes **`workflow_terminal`** when `nodes.length > 0`: `seedRunEventId` is the last node’s `runEventId`, `ancestorRunEventIds` is `[seed, parent(seed), …, root]` following **`parentRunEventId`** on nodes. When **`workflowResult`** is supplied, append one **`verification_step`** per `steps[i]` that has a matching `tool_observed` for `steps[i].seq` (seed = evaluated observation for that `seq`, same ancestor walk). Ordering: `workflow_terminal` first, then **`verification_step`** rows in ascending `stepIndex`.

**CLI:** `verify-workflow execution-trace --workflow-id <id> --events <path> [--workflow-result <path>] [--format json|text]`. Success: stdout = `ExecutionTraceView` JSON or `formatExecutionTraceText` output; stderr empty; exit **0**. Operational failure (usage, graph validation, read/parse errors): stderr = one-line `cliErrorEnvelope`; stdout empty; exit **3**.

**In-process:** `observeStep` accepts the same union; **`withWorkflowVerification`** buffers all valid events in capture order and feeds only `tool_observed` into verification (same as batch).

**Module binding:** `executionTrace.ts`, `loadEvents.ts`, `execution-trace-view.schema.json`, `event.schema.json`.

## Tool registry

File: [`schemas/tools-registry.schema.json`](../schemas/tools-registry.schema.json).

Each entry:

- `toolId` (unique)
- `effectDescriptionTemplate`: string with `{/json/pointer}` tokens → replaced with `JSON.stringify(value)` or `MISSING` (audit string only; **not** used for reconciliation).
- `verification`: either
  - `{ "kind": "sql_row", "table", "key", "requiredFields" }` (same pointer/const rules as before), or
  - `{ "kind": "sql_effects", "effects": [ … ] }` with **at least two** items. Each item has **`id`** (non-empty string, unique within the array) plus the same `table` / `key` / `requiredFields` shape as a `sql_row` entry (no nested `kind` on the item).

**Resolved internal row shape** (one keyed `SELECT` per effect):

```json
{
  "kind": "sql_row",
  "table": "string",
  "keyColumn": "string",
  "keyValue": "string",
  "requiredFields": { "col": "string | number | boolean | null }
}
```

`requiredFields` values must be **string, number, boolean, or null** (JSON scalars at the pointer). Empty object = **presence-only** (row must exist).

**Multi-effect resolution:** each effect is resolved independently; effect **`id`** values are sorted by UTF-16 code unit order before reconciliation output is built. Duplicate **`id`** in the registry → resolver error `DUPLICATE_EFFECT_ID`.

### Resolver error codes → step `incomplete_verification`

| Code | Meaning |
|------|---------|
| `UNKNOWN_TOOL` | `toolId` not in registry |
| `CONST_STRING_EMPTY` | `const` string spec empty or not a string |
| `STRING_SPEC_POINTER_MISSING` | Pointer missing or null |
| `STRING_SPEC_TYPE` | Value at pointer is not a string |
| `STRING_SPEC_EMPTY` | Empty string at pointer |
| `KEY_VALUE_POINTER_MISSING` | Key value pointer missing or null |
| `KEY_VALUE_NOT_SCALAR` | Key value is object/array |
| `KEY_VALUE_SPEC_INVALID` | Key value spec shape invalid |
| `UNSUPPORTED_VERIFICATION_KIND` | Verification kind is not `sql_row` |
| `TABLE_SPEC_INVALID` | Table spec shape invalid |
| `TABLE_POINTER_INVALID` | Table pointer did not resolve to a non-empty string |
| `REQUIRED_FIELDS_POINTER_MISSING` | `requiredFields` pointer missing or null |
| `REQUIRED_FIELDS_NOT_OBJECT` | `requiredFields` not a plain object |
| `REQUIRED_FIELDS_VALUE_UNDEFINED` | Field value is `undefined` |
| `REQUIRED_FIELDS_VALUE_NOT_SCALAR` | Field value is object/array or unsupported type |
| `INVALID_IDENTIFIER` | Table / column / `requiredFields` key not matching `^[a-zA-Z_][a-zA-Z0-9_]*$` |
| `DUPLICATE_EFFECT_ID` | Same `id` twice in `sql_effects.effects` |

Resolver messages for `sql_effects` prefix per-effect failures with `effects[<id>].` (e.g. `effects[primary].requiredFields …`).

**Authoring templates:** Copy-paste starting points live under [`examples/templates/`](../examples/templates/) (`sql_row` and `sql_effects` examples); they must validate against `tools-registry.schema.json`.

## Registry validation (`validate-registry`) — normative

This section is the **single normative contract** for registry validation. The machine shape is [`schemas/registry-validation-result.schema.json`](../schemas/registry-validation-result.schema.json). [README.md](../README.md) may repeat one example command only and must link here.

### Purpose

Validate a **`tools.json`** registry **without** opening SQLite or Postgres: JSON Schema, duplicate `toolId`, duplicate `sql_effects` effect `id` (within each tool), and—when event files are supplied—resolver checks (`resolveVerificationRequest`) against replayed observations (same logical-step and last-observation rules as batch verification).

### CLI

```text
verify-workflow validate-registry --registry <path>
verify-workflow validate-registry --registry <path> --events <path> --workflow-id <id>
```

- **`--registry`**: required.
- **`--events`** and **`--workflow-id`**: **both** or **neither**. Mismatch → exit **3**, code **`VALIDATE_REGISTRY_USAGE`**.
- Unknown options or stray positional arguments → exit **3**, **`VALIDATE_REGISTRY_USAGE`**.
- **`--help` / `-h`**: usage on **stdout**, exit **0** (handled only when `validate-registry` is the first argument; see `cli.ts`).

### Exit codes and I/O

| Exit | stdout | stderr |
|------|--------|--------|
| **0** | Exactly one UTF-8 JSON object: `RegistryValidationResult` matching `registry-validation-result.schema.json`, with **`valid`: `true`** | **Empty** (zero bytes) |
| **1** | Same schema; **`valid`: `false`** | Multi-line UTF-8 human report (grammar below) |
| **3** | **Empty** (zero bytes) | Exactly **one** line: `execution_truth_layer_error` JSON envelope (same shape as [CLI operational errors](#cli-operational-errors)) |

Codes for exit **3** on this subcommand include **`REGISTRY_READ_FAILED`**, **`REGISTRY_JSON_SYNTAX`**, **`EVENTS_READ_FAILED`**, **`VALIDATE_REGISTRY_USAGE`**, **`INTERNAL_ERROR`** (e.g. result failed output schema validation—should not occur in production).

**Note:** Duplicate `toolId` and JSON Schema failures are **exit 1**, not **3**: they produce structured issues on stdout so automation can parse fixes.

### Human stderr grammar (exit **1** only)

1. First line exactly: **`Registry validation failed:`**
2. Then zero or more lines, each starting with **`- structural (`** *kind* **`): `** *message*
3. Then zero or more lines for resolution issues, each starting with either:
   - **`- resolution (NO_STEPS_FOR_WORKFLOW): `** *message* (exactly one such line when there are no tool_observed events for the workflow after filtering), or
   - **`- resolution (workflow `** *workflowId* **` seq `** *seq* **` tool `** *toolId* **`): [`** *code* **`] `** *message*

Order: all **structural** lines first (JSON Schema issues sorted by `instancePath` then `keyword`; then other structural kinds in implementation order). **Resolution** lines are sorted by `seq` ascending, then `toolId` (with **`NO_STEPS_FOR_WORKFLOW`** first via null `seq`/`toolId` sort order).

### `RegistryValidationResult` semantics

- **`schemaVersion`**: **1**.
- **`valid`**: **`true`** iff **`structuralIssues`** and **`resolutionIssues`** are both empty. **`resolutionSkipped`** and **`eventLoad`** do not affect **`valid`**.
- **`structuralIssues`**: objects with **`kind`** one of **`json_schema`**, **`duplicate_tool_id`**, **`sql_effects_duplicate_effect_id`**, plus **`message`** and optional fields (`instancePath`, `keyword`, `toolId`, `effectId`).
- **`resolutionIssues`**: for per-step resolver failures, **`seq`** (integer) and **`toolId`** (string). For **`NO_STEPS_FOR_WORKFLOW`**, **`seq`** and **`toolId`** are JSON **`null`**; **`message`** equals **`RUN_LEVEL_MESSAGES.NO_STEPS_FOR_WORKFLOW`** in `failureCatalog.ts`.
- **`resolutionSkipped`**: divergent retry groups only: **`code`** **`RETRY_OBSERVATIONS_DIVERGE`**, **`message`** exactly **`RETRY_OBSERVATIONS_DIVERGE_MESSAGE`** in `failureCatalog.ts` (same literal as pipeline divergent step outcome).
- **`eventLoad`**: present iff both **`--events`** and **`--workflow-id`** were passed: **`workflowId`**, **`malformedEventLineCount`** (NDJSON lines that fail JSON parse or event schema, same counting rules as `loadEventsForWorkflow`).

Event-backed resolution uses **`loadEventsForWorkflow`** (including malformed line handling) and **`planLogicalSteps`**; divergent steps do not run `resolveVerificationRequest` and appear only in **`resolutionSkipped`**.

### Library

**`validateToolsRegistry({ registryPath, eventsPath?, workflowId? })`** returns the same object written to stdout by the CLI. If **`eventsPath`** or **`workflowId`** is set without the other, it throws **`TruthLayerError`** with **`VALIDATE_REGISTRY_USAGE`**. File read / JSON parse errors throw the same **`TruthLayerError` codes** as the CLI would use for exit **3**.

## Workflow result: multi-effect shape

When the registry used `sql_effects`, the step’s **`verificationRequest`** on `WorkflowResult` is:

```json
{
  "kind": "sql_effects",
  "effects": [
    {
      "id": "string",
      "kind": "sql_row",
      "table": "string",
      "keyColumn": "string",
      "keyValue": "string",
      "requiredFields": {}
    }
  ]
}
```

The step’s **`evidenceSummary`** **must** be exactly:

```json
{
  "effectCount": <N>,
  "effects": [
    {
      "id": "<same as in verificationRequest>",
      "status": "verified" | "missing" | "inconsistent" | "incomplete_verification",
      "reasons": [],
      "evidenceSummary": {}
    }
  ]
}
```

with **`effects`** sorted by **`id`** (UTF-16 lexicographic). Single-`sql_row` steps **must not** use top-level keys `effectCount` or `effects` on `evidenceSummary` (schema-enforced).

**Step rollup (multi-effect only):** all effects `verified` → step `verified`. Any effect `incomplete_verification` → step `incomplete_verification`. Else if every effect is `missing` or `inconsistent` → step `inconsistent` with one summary reason `MULTI_EFFECT_ALL_FAILED`. Else if at least one `verified` and at least one `missing`/`inconsistent` → step `partially_verified` with one summary reason `MULTI_EFFECT_PARTIAL`.

## SQL connector contract

### SQLite (`node:sqlite`)

- Only query: `SELECT * FROM "<table>" WHERE "<keyColumn>" = ? LIMIT 2` with `String(keyValue)` bound.

### Postgres (`pg.Client`)

- Only query: `SELECT * FROM "<table>" WHERE "<keyColumn>" = $1 LIMIT 2` with one text parameter `String(keyValue)`.
- Session: **`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`** before any verification statement, then mandatory `SELECT 1`, then verification `SELECT`s.

### Shared

- Column names in results are normalized to **lowercase** before reconciliation.

## Reconciler rule table (`sql_row`)

Precondition: iterate `requiredFields` keys in **lexicographic** order.

Let `n = rows.length` after `LIMIT 2`.

1. Connector throws → `incomplete_verification` / `CONNECTOR_ERROR` (`message` passed through `formatOperationalMessage`; do not rely on exact string equality across drivers).
2. `n === 0` → `missing` / `ROW_ABSENT`.
3. `n >= 2` → `inconsistent` / `DUPLICATE_ROWS` (no field inspection).
4. `n === 1`, row `row`, for each key `k` in sorted order, `col = k.toLowerCase()`:
   - `col` not in `row` → `incomplete_verification` / `ROW_SHAPE_MISMATCH`.
   - `typeof row[col] === "object"` and not `null` and not `Date` → `incomplete_verification` / `UNREADABLE_VALUE`.
   - Otherwise evaluate **`verificationScalarsEqual(requiredFields[k], row[col])`** (implemented in `valueVerification.ts`). On **no match**: `inconsistent` / `VALUE_MISMATCH`, reason message exactly **`Expected <expected> but found <actual> for field <k>`** where `<expected>` and `<actual>` are **canonical display** strings (see below), and `evidenceSummary` includes **`field`**, **`expected`**, **`actual`**, **`rowCount`: 1**.
5. All fields pass (or `requiredFields` empty) → `verified`.

### Canonical display (for message + `evidenceSummary`)

Used for `<expected>` and `<actual>`:

- Expected or actual **null** (including **undefined** in the row): token **`null`** (four lowercase ASCII letters, no quotes).
- **Boolean**: **`true`** or **`false`** (lowercase).
- **Number** (finite): **`String(n)`** in ECMAScript. **`NaN`**, **`Infinity`**, **`-Infinity`**: **`NaN`**, **`Infinity`**, **`-Infinity`** respectively.
- **String** (expected or actual): **`JSON.stringify(s)`** (quotes and JSON escapes).
- **BigInt** (actual): **`JSON.stringify(actual.toString())`**.
- **Date** (actual, valid): **`JSON.stringify(actual.toISOString())`**.

### Matching (`verificationScalarsEqual`) — evaluate in this order; first matching rule decides

1. **Expected `null`**: **match** iff `actual === null || actual === undefined`.
2. **Actual `null` or `undefined`**, expected not `null`: **no match**.
3. **Expected `boolean`**: **match** iff (`typeof actual === "boolean"` && `actual === expected`) **or** (`typeof actual === "number"` && `Number.isFinite(actual)` && ((`expected === true` && `actual === 1`) || (`expected === false` && `actual === 0`))).
4. **Expected `number`**: if `!Number.isFinite(expected)`, **no match**. Otherwise:
   - **4a.** `typeof actual === "number"` && `Number.isFinite(actual)` && `actual === expected` → **match**.
   - **4b.** `typeof actual === "bigint"` && `Number.isInteger(expected)` && `expected >= Number.MIN_SAFE_INTEGER` && `expected <= Number.MAX_SAFE_INTEGER` && `actual === BigInt(expected)` → **match**.
   - **4c.** `typeof actual === "string"`: let `t = actual.trim()`. **Match** iff `JSON.parse(t)` is a finite `number`, `JSON.parse(t) === expected`, and **`JSON.stringify(JSON.parse(t)) === JSON.stringify(expected)`** (rejects strings such as `"042"` where `JSON.parse` throws).
5. **Expected `string`**: let `e = expected.trim()`.
   - **5a.** `typeof actual === "string"` → **match** iff `actual.trim() === e`.
   - **5b.** `typeof actual === "number"` && `Number.isFinite(actual)` → **match** iff `e === JSON.stringify(actual)`.
   - **5c.** `typeof actual === "boolean"` → **match** iff `e === JSON.stringify(actual)`.
   - **5d.** `actual instanceof Date` && valid time → **match** iff `e === actual.toISOString()`.
   - Otherwise **no match**.
6. If no rule above matched, **no match**.

Coercion is **only** what this section defines; there is no separate `String(row[col]).trim()` equality path.

## Verification policy (normative)

**`WorkflowResult.verificationPolicy`** is always emitted (see schema). **`strong`:** timing fields are **`0`**; one SQL read per logical step (or one multi-effect rollup per step). **`eventual`:** **`verificationWindowMs`** and **`pollIntervalMs`** are integers ≥ **1** with **`pollIntervalMs` ≤ `verificationWindowMs`**. The executor repeats reads until a terminal outcome or the window elapses. Row absence alone until the window ends → step **`uncertain`** (not **`missing`**). Determinate outcomes (**`inconsistent`**, **`incomplete_verification`**, **`partially_verified`**) stop polling immediately. **SQLite:** `strong` uses the synchronous runner; `eventual` uses the async runner with real delays between polls. **Postgres:** always the async path.

## Workflow status (PRD-aligned)

Step statuses: `verified` | `missing` | `inconsistent` | `incomplete_verification` | `partially_verified` | `uncertain`.

| Workflow status | Condition |
|-----------------|-----------|
| `incomplete` | Any run-level code (`MALFORMED_EVENT_LINE`, …), **or** zero steps, **or** any step `incomplete_verification`. |
| `inconsistent` | Not incomplete as above, and any step in `{ missing, inconsistent, partially_verified }`. |
| `complete` | Not incomplete, every step `verified`. |

**Note:** Step **`uncertain`** does not by itself force `incomplete` before determinate failures are checked: e.g. **`uncertain` + `missing`** → workflow **`inconsistent`**. **`uncertain`** alone (with other steps `verified` or only `uncertain`) yields **`incomplete`** via the default branch when no step is `incomplete_verification`.

**PRD mapping:** PRD §4 “Failed” (determinate bad outcome) ↔ `inconsistent`. §4 “Incomplete” (cannot confirm) ↔ `incomplete`. §6 three bullets ↔ these three strings. **Multi-effect:** step-level “partial success” is `partially_verified`; the workflow is still **`inconsistent`** until every step is `verified`.

**Compatibility:** Emitted **`WorkflowResult.schemaVersion`** is **8** with required **`workflowTruthReport`** and **`verificationRunContext`**. The engine-only JSON (`schemaVersion` **6**) is defined by [`schemas/workflow-engine-result.schema.json`](../schemas/workflow-engine-result.schema.json). Required **`verificationPolicy`** and **`eventSequenceIntegrity`**; non-**`verified`** steps require **`failureDiagnostic`**; consumers must allow step `status` **`uncertain`** (see [`schemas/workflow-result.schema.json`](../schemas/workflow-result.schema.json)).

## Debug Console (normative)

On-call **interactive debugging** is supported by a **local-only** web UI served by the CLI subcommand **`verify-workflow debug --corpus <dir> [--port <n>]`**. The server binds **127.0.0.1** only (no LAN exposure in this MVP). **`npm run build`** copies static assets from **`debug-ui/`** to **`dist/debug-ui/`** next to **`dist/cli.js`**.

### Debug Console audiences

- **Integrator:** Export each run as a **child directory** of the corpus root: **`<corpusRoot>/<runId>/workflow-result.json`** and **`<corpusRoot>/<runId>/events.ndjson`** (same filenames for every run). Optional **`<corpusRoot>/<runId>/meta.json`**: JSON object with optional string **`customerId`**, optional string **`capturedAt`** (ISO-8601). No other **`meta.json`** fields are required in v1.
- **Operator:** Run **`verify-workflow debug --corpus <path>`**, open the printed **http://127.0.0.1:…/** URL. Use **Runs** (filters + pagination), **Patterns** (corpus-wide aggregates), **Compare** (multi-select). Load-failed artifacts appear as **first-class rows** (not omitted).
- **Engineer:** Implementation modules are listed in the Engineer table under [Audiences](#audiences) (`debugCorpus.ts`, `debugFocus.ts`, `debugPatterns.ts`, `debugRunFilters.ts`, `debugRunIndex.ts`, `debugServer.ts`). **`recurrenceSignature`** for pattern aggregation is reused from **`runComparison.ts`**.

### Corpus load outcomes (normative)

Every immediate child directory of **`corpusRoot`** with a safe **`runId`** (no path separators, not **`.`** or **`..`**) is enumerated. For each **`runId`**, the loader produces either **`loadStatus: "ok"`** or **`loadStatus: "error"`**. **Silent omission is forbidden.** Resolved paths must stay under the corpus root; otherwise **`PATH_ESCAPE`**. Error codes include **`MISSING_WORKFLOW_RESULT`**, **`MISSING_EVENTS`**, **`WORKFLOW_RESULT_JSON`**, **`WORKFLOW_RESULT_INVALID`**, **`META_INVALID`**, **`EVENTS_LOAD_FAILED`**.

**stderr:** On server start, the CLI prints one line per load error: **`[debug] corpus run "<runId>" load error <code>: <message>`** (mirrors UI-visible failures).

### `capturedAtEffective` (normative)

If **`meta.capturedAt`** parses as a valid date, use that instant. **Otherwise** use **`mtimeMs`** of **`workflow-result.json`** only (no fallback to **`events.ndjson`** mtime).

### HTTP API (normative)

**`GET /api/health`** → **`{ ok: true }`**.

**`GET /api/runs`** — **server-side filters only** (no full-corpus dump to the client). Query parameters (AND semantics; all optional except as noted):

| Param | Meaning |
|--------|---------|
| **`loadStatus`** | **`ok`** \| **`error`** \| omit = both |
| **`workflowId`** | Exact match on **`loadStatus=ok`** rows only. **`loadStatus=error`** rows remain eligible when **`includeLoadErrors=true`** (default), so broken artifacts stay visible when scoping. |
| **`status`** | **`complete`** \| **`incomplete`** \| **`inconsistent`** (ok rows only) |
| **`failureCategory`** | Actionable category string (ok rows only) |
| **`reasonCode`** | Exact token match against run-level codes and step reason codes on the row |
| **`toolId`** | Ok row has a step with this **`toolId`** |
| **`customerId`** | Exact match; use literal **`__unspecified__`** to match runs with no **`meta.customerId`** |
| **`timeFrom` / `timeTo`** | Inclusive range on **`capturedAtEffective`** (milliseconds since epoch) |
| **`includeLoadErrors`** | Default **true**; if **`false`**, error rows are excluded from the listing |

**Pagination:** **`limit`** default **100**, max **500**; **`cursor`** opaque (base64url JSON **`{ offset }`**). Response: **`items`**, **`nextCursor`**, **`totalMatched`**, **`filterEcho`**. Sort: **`runId`** ascending.

**`GET /api/runs/:runId`** — **`200`** always for a known **`runId`**. **`ok`:** **`workflowResult`**, schema-valid **`executionTrace`**, paths, **`meta`**, **`capturedAtEffectiveMs`**. **`error`:** **`error`**, **`pathsTried`**, optional **`rawPreview`** (first ≤ 8KiB UTF-8 of the failing file when readable).

**`GET /api/runs/:runId/focus`** — **`200`** with **`{ targets: [{ kind, value, rationale }] }`** from **`buildFocusTargets`** for ok runs; **`409`** **`FOCUS_NOT_AVAILABLE`** for error rows. The browser UI must not reimplement this mapping.

**`POST /api/compare`** — body **`{ runIds: string[] }`** (length ≥ 2). **400** if any run is not loaded ok, or **`COMPARE_WORKFLOW_ID_MISMATCH`**. Response: **`RunComparisonReport`** JSON + **`humanSummary`** text (**`formatRunComparisonReport`**).

**`GET /api/corpus-patterns`** — same filter query subset as **`/api/runs`** (no pagination). If more than **10_000** load-ok rows match → **413** JSON **`code: CORPUS_TOO_LARGE`**. If **`workflowId`** is set and more than **50** ok runs match that id → **413** **`PATTERNS_COMPARE_TOO_MANY`**. Otherwise **`200`** body **`schemaVersion: 1`** with **`actionableCategoryHistogram`**, **`topRunLevelCodes`**, **`topStepReasonCodes`**, **`recurrenceCandidates`** (signature **`hitRuns`** across the filtered corpus), and optional **`pairwiseRecurrence`** when **`workflowId`** filter is set and count ≤ 50.

### Example corpus

**`examples/debug-corpus/`** ships **four** runs: one **`ok`**, three **`error`** (bad JSON, missing events, schema-invalid **`{}`**) for CI and manual smoke.

## Cross-run comparison (normative)

This section defines **cross-run comparison**: comparing saved workflow artifacts locally (no hosted backend). **Inputs** are validated with **`schemas/workflow-result-compare-input.schema.json`**: each file is either **`WorkflowEngineResult`** (**`schemaVersion` 6**, or legacy **5** upgraded with empty **`verificationRunContext`**) or emitted **`WorkflowResult`** (**`schemaVersion` 8**, or legacy **6–7**). The CLI normalizes each input to emitted v8 (`finalizeEmittedWorkflowResult`; legacy inputs upgraded as in [Failure analysis](#failure-analysis-normative) and [Actionable failure classification](#actionable-failure-classification-normative)). For **`workflowTruthReport.schemaVersion` ≥ **3**, recomputed truth must match the file (**`util.isDeepStrictEqual`**) — mismatch → exit **3**, **`COMPARE_WORKFLOW_TRUTH_MISMATCH`**). The machine output is **`RunComparisonReport`** (`schemas/run-comparison-report.schema.json`, **`schemaVersion` 2**), including **`perRunActionableFailures`**, **`categoryHistogram`**, and **`actionableCategoryRecurrence`**; behavioral semantics below are authoritative—the schema is structural only (see [`$comment`](../schemas/run-comparison-report.schema.json)).

### `logicalStepKey`

For a step with **`verificationRequest !== null`**:

- **`sql_row`:** `sql_row|${table}|${keyColumn}|${keyValue}` (field values from the resolved request on the step outcome).
- **`sql_effects`:** `sql_effects|` followed by one segment per effect, **sorted by effect `id` in UTF-16 lexicographic order** (same ordering as `compareUtf16Id` / object key sort elsewhere in this doc). Each segment is: `id|${id}|${table}|${keyColumn}|${keyValue}|`.

**Duplicate `logicalStepKey` in one run:** If two steps produce the same key, **keep the step with the lower `seq`** for that key. Emit **`ambiguousLogicalKeyResolutions`** on the report with `chosenSeq` and `droppedSeq`.

### Pairwise comparison (immediate prior vs current)

Inputs are an **ordered list** of runs `R0 … R(n-1)` where **`R(n-1)` is current** and **`R(n-2)` is immediate prior** (`n ≥ 2`).

**Run-level:** Let `M_prior` and `M_cur` be **multisets** of `runLevelReasons[].code`. **introducedRunLevelCodes** = multiset difference `M_cur − M_prior` (expand as a sorted list with multiplicity for JSON). **resolvedRunLevelCodes** = `M_prior − M_cur`.

**Bucket A — steps with `verificationRequest !== null`:** Build `logicalStepKey → step` for each run (duplicate rule above). Align by **key**, not by `seq`. For each key:

- **Intersection, both verified:** `unchangedOk`. Report `seqPrior`, `seqCurrent`, `toolIdPrior`, `toolIdCurrent` so **reordering is visible** without implying failure churn.
- **Intersection, prior verified / current failing:** `introducedFailure`.
- **Intersection, prior failing / current verified:** `resolvedFailure`.
- **Intersection, both failing:** `bothFailing` with multiset differences on step-level `reasons[].code` (**introducedStepReasonCodes**, **resolvedStepReasonCodes**). For `sql_effects`, also compare each effect row in `evidenceSummary.effects` **by effect `id`**: same verified/failing and multiset reason deltas per effect. **`toolIdChanged`** is set when `toolId` differs at the same key; it does not override failure classification.
- **Key only in prior:** `structuralRemoval` with `priorWasFailing`.
- **Key only in current:** `structuralAddition` with `currentIsFailing`.

**Bucket B — `verificationRequest === null` and failing:** Consider only steps with **`status !== "verified"`**. Compute **`recurrenceSignature`** (below) per such step. Let **P** and **C** be **multisets** of signatures (one entry per failing step; **no** within-run dedup). **introducedFailureSignatures** / **resolvedFailureSignatures** are multiset differences; **unchangedFailureInstanceCounts** lists `min(P(s), C(s))` per signature `s`.

### `recurrenceSignature` (failing steps)

Used for **bucket B** and **recurrence**. **Must not** include `seq` or `toolId`.

Format:

1. `${status}|` then step-level reason codes sorted **lexicographically (UTF-16)** with multiplicity (sort the multiset as a list of `reasons[].code` strings).
2. For each **failing** effect in `evidenceSummary.effects` (when present), sorted by effect `id` (UTF-16), append `|e:${id}:${status}:r:` + effect reason codes sorted the same way, concatenated with commas.

### Recurrence over the full window

For each run index `i`, build the **set** of `recurrenceSignature` values from **all failing steps** in that run (**within-run dedup**: each signature counted once per run for membership). A signature is **recurrent** if it appears in runs at **≥ 2 distinct indices**. Report `runIndices`, `runsHitCount`, and up to **3 exemplars** `{ runIndex, seq, toolId }` per pattern (exemplars are **not** part of signature equality).

### Success and failure I/O (compare subcommand)

**Success:** Write **one** human summary line block to **stderr** (`formatRunComparisonReport`), then **one** JSON object to **stdout** (`RunComparisonReport`). Exit **0**.

**Operational failure:** **No** comparison JSON on **stdout** (stdout empty). **Stderr** is **exactly one** JSON line: the same **`execution_truth_layer_error`** envelope as [CLI operational errors](#cli-operational-errors), with a **`COMPARE_*`** code. Exit **3**.

### Cross-run comparison: implementation bindings (normative)

- **CLI:** `verify-workflow compare --prior <path> [--prior <path> …] --current <path>`. Each `--prior` is a saved **`WorkflowResult`** JSON file; order is oldest → newest; **`--current`** is the last run. At least one `--prior` is required.
- **`displayLabel`:** Integrator-supplied opaque string per run. The **reference CLI** sets **`displayLabel`** to the **basename** of each file path (never a full path in the report).
- **Failure envelope:** Same shape and rules as § CLI operational errors; compare-specific codes live in `failureCatalog.ts` (e.g. `COMPARE_USAGE`, `COMPARE_WORKFLOW_ID_MISMATCH`, `COMPARE_WORKFLOW_TRUTH_MISMATCH`, `COMPARE_INPUT_READ_FAILED`, `COMPARE_INPUT_JSON_SYNTAX`, `COMPARE_INPUT_SCHEMA_INVALID`, `COMPARE_RUN_COMPARISON_REPORT_INVALID`).
- **Schema:** `schemas/run-comparison-report.schema.json` validates stdout on success; root **`$comment`** points to this document’s **Cross-run comparison (normative)** anchor.

## Validation matrix (what CI proves vs operations)

| Claim | Proven in CI / local | Proven in production / pilot only |
|-------|----------------------|-----------------------------------|
| No `complete` without SQL verification | Yes — integration tests | — |
| Postgres session read-only + SELECT-only role | Yes — `postgres-session-readonly` / `postgres-privilege` tests | — |
| Four step statuses + retries / divergent seq / unknown tool / malformed line | Yes — `npm test` (SQLite path) + Postgres tests in `npm run test:ci` | — |
| Framework-agnostic capture | Yes — NDJSON contract + examples | Integration list / adapters |
| Manual verification steps ↓, time-to-confirm ↓, trust / re-runs | No | Metrics & study (define counters in ops) |

**Engineering MVP “solved”:** `npm test` and **`npm run test:ci`** pass; CLI obeys exit codes; contracts match this document.

## Examples

Bundled files under [`examples/`](../examples/): `seed.sql`, `tools.json`, `events.ndjson`.

- **Onboarding:** run **`npm start`** or **`npm run first-run`** from the repository root (same command). The onboarding driver is [`scripts/first-run.mjs`](../scripts/first-run.mjs) (`npm run build && node scripts/first-run.mjs`). It seeds `examples/demo.db`, prints plain-language framing plus **human verification reports on stdout** (via a custom **`truthReport`** callback), then verifies workflows `wf_complete` (expect `complete` / `verified`) and `wf_missing` (expect `inconsistent` / `missing` / `ROW_ABSENT`). **`example:workflow-hook`:** run **`npm run example:workflow-hook`** for a minimal **`withWorkflowVerification`** + **`observeStep`** demo (SQLite temp DB, one event from **`examples/events.ndjson`**).
- **CLI log streams:** For the CLI, a **human-readable verification report** is written to **stderr** and the machine-readable **workflow result JSON** to **stdout** on verdict exits **0–2** (default **`truthReport`**); full format is **[Human truth report](#human-truth-report)**. Repository README links use **`docs/execution-truth-layer.md#human-truth-report`** for that section.

(Node may print an experimental warning for `node:sqlite` depending on version.)
